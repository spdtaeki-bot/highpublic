import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  BarChart3,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Flame,
  Layers,
  Medal,
  Percent,
  Search,
  Share2,
  Sparkles,
  Star,
  Timer,
  TrendingUp,
  User,
  Users,
  X,
  CheckCircle2,
  Clock,
  ArrowUpDown,
  Building2,
  Award,
} from "lucide-react";
import * as htmlToImage from "html-to-image";
import { format, parseISO, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";
import { ko } from "date-fns/locale";
import { cn } from "../lib/utils";
import { Staff, DispatchRecord, BouncedRecord } from "../types";
import {
  subscribeToDispatchesByDateRange,
  subscribeToBouncedByDateRange,
  subscribeToAttendanceByDateRange,
} from "../services/dispatchService";
import { parseStaffNameAndAffiliation } from "./SettlementView";

interface StatsViewProps {
  staff: Staff[];
  selectedDate: string;
  onSelectDate?: (date: string) => void;
  staffRenameMap?: Map<string, string>;
}

export interface WeekRange {
  weekNum: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  label: string;
}

export interface StaffStatItem {
  staffId: string;
  name: string;
  affiliation: string;
  isDirect: boolean;
  category: "하퍼" | "퍼블릭" | "커피";
  employmentType: "DIRECT" | "DELEGATED";
  // Attendance
  attendanceDays: number;
  attendanceRate: number; // % against total business days
  attendanceDates: string[];
  weeklyAttendance: Record<number, number>;
  // Choice
  dispatchCount: number;
  bounceCount: number;
  totalAttempts: number;
  choiceRate: number; // %
  // Extension
  extendedCount: number;
  extensionRate: number; // %
  // Units / 갯수
  monthlyTotalUnits: number;
  fullUnits: number; // 완티
  bantiCount: number; // 반티
  weeklyUnits: Record<number, number>;
  avgUnitsPerDay: number;
  // Breakdown
  tableUnits: number;
  publicUnits: number;
  hopperUnits: number;
  // Raw records for modal
  records: DispatchRecord[];
  bouncedRecords: BouncedRecord[];
}

const formatRecordTime = (timeVal: any) => {
  if (!timeVal) return "";
  try {
    if (typeof timeVal === "string") {
      const match = timeVal.trim().match(/^(\d{1,2}):(\d{2})/);
      if (match) {
        return `${match[1].padStart(2, "0")}:${match[2]}`;
      }
    }
    const d = timeVal.toDate ? timeVal.toDate() : new Date(timeVal);
    if (!isNaN(d.getTime())) {
      return format(d, "HH:mm");
    }
  } catch (e) {
    return "";
  }
  return "";
};

/**
 * 영업일 기준 시간 오프셋(분 단위) 계산:
 * 영업일은 당일 18:00 (오후 6시)부터 익일 17:59 (오후 5시 59분)까지를 1영업일로 처리합니다.
 * 
 * 정렬 기준:
 * - 18:00 ~ 23:59 (당일 저녁/밤): h * 60 + m (1080 ~ 1439)
 * - 00:00 ~ 17:59 (익일 새벽/오전/오후): (h + 24) * 60 + m (1440 ~ 2519)
 * 
 * 예: 
 * 22:55 -> 22 * 60 + 55 = 1375분 (영업일 전반부)
 * 07:00 -> (7 + 24) * 60 + 0 = 1860분 (영업일 후반부, 22:55보다 뒤)
 * 07:06 -> (7 + 24) * 60 + 6 = 1866분 (07:00보다 뒤)
 */
const getBusinessMinutes = (timeVal: any): number => {
  if (!timeVal) return 99999;

  let h = -1;
  let m = 0;

  if (typeof timeVal === "string") {
    const trimmed = timeVal.trim();
    const match = trimmed.match(/^(\d{1,2}):(\d{2})/);
    if (match) {
      h = parseInt(match[1], 10);
      m = parseInt(match[2], 10);
    } else {
      try {
        const d = new Date(trimmed);
        if (!isNaN(d.getTime())) {
          h = d.getHours();
          m = d.getMinutes();
        }
      } catch {}
    }
  } else if (typeof timeVal === "object" && timeVal !== null) {
    try {
      const d = timeVal.toDate ? timeVal.toDate() : new Date(timeVal);
      if (d instanceof Date && !isNaN(d.getTime())) {
        h = d.getHours();
        m = d.getMinutes();
      }
    } catch {}
  }

  if (h < 0 || h > 23 || isNaN(h) || isNaN(m)) return 99999;

  return (h < 18 ? h + 24 : h) * 60 + m;
};

const compareBusinessRecords = (
  aDate: string = "",
  aTimeVal: any,
  bDate: string = "",
  bTimeVal: any
): number => {
  if (aDate !== bDate) {
    return (aDate || "").localeCompare(bDate || "");
  }
  return getBusinessMinutes(aTimeVal) - getBusinessMinutes(bTimeVal);
};

export const StatsView: React.FC<StatsViewProps> = ({
  staff,
  selectedDate,
  onSelectDate,
  staffRenameMap,
}) => {
  // Current viewing month: "YYYY-MM"
  const [currentMonth, setCurrentMonth] = useState<string>(() => {
    return selectedDate ? selectedDate.slice(0, 7) : format(new Date(), "yyyy-MM");
  });

  // Data states for the current month
  const [monthlyDispatches, setMonthlyDispatches] = useState<DispatchRecord[]>([]);
  const [monthlyBounced, setMonthlyBounced] = useState<BouncedRecord[]>([]);
  const [monthlyAttendance, setMonthlyAttendance] = useState<
    Array<{ date: string; staffIds: string[]; checkInTimes?: Record<string, any> }>
  >([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAffiliation, setSelectedAffiliation] = useState<string>("ALL");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedEmployment, setSelectedEmployment] = useState<"ALL" | "DIRECT" | "DELEGATED">("ALL");
  const [sortBy, setSortBy] = useState<"units" | "attendance" | "choice" | "extension" | "avgUnits" | "name">("units");
  const [sortDirection, setSortDirection] = useState<"desc" | "asc">("desc");
  const [viewLayout, setViewLayout] = useState<"table" | "card">("table");
  const [selectedStaffDetail, setSelectedStaffDetail] = useState<StaffStatItem | null>(null);
  const [selectedAttDateFilter, setSelectedAttDateFilter] = useState<string | null>(null);

  const handleOpenStaffDetail = (item: StaffStatItem) => {
    setSelectedStaffDetail(item);
    setSelectedAttDateFilter(null);
  };

  // Capturing State
  const [isCapturing, setIsCapturing] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  // Month Date Range
  const monthStart = useMemo(() => `${currentMonth}-01`, [currentMonth]);
  const monthEnd = useMemo(() => {
    try {
      const parsed = parseISO(`${currentMonth}-01`);
      return format(endOfMonth(parsed), "yyyy-MM-dd");
    } catch {
      return `${currentMonth}-31`;
    }
  }, [currentMonth]);

  // Subscribe to month data
  useEffect(() => {
    setIsLoading(true);

    // Safety timeout to prevent indefinite buffering on slow/mobile networks
    const safetyTimer = setTimeout(() => {
      setIsLoading(false);
    }, 3500);

    const unsubDispatches = subscribeToDispatchesByDateRange(
      monthStart,
      monthEnd,
      (data) => {
        setMonthlyDispatches(data);
        setIsLoading(false);
      },
      (err) => {
        console.error("Monthly dispatches error:", err);
        setIsLoading(false);
      }
    );

    const unsubBounced = subscribeToBouncedByDateRange(
      monthStart,
      monthEnd,
      (data) => {
        setMonthlyBounced(data);
      },
      (err) => {
        console.error("Monthly bounced error:", err);
      }
    );

    const unsubAttendance = subscribeToAttendanceByDateRange(
      monthStart,
      monthEnd,
      (data) => {
        setMonthlyAttendance(data);
      },
      (err) => {
        console.error("Monthly attendance error:", err);
      }
    );

    return () => {
      clearTimeout(safetyTimer);
      unsubDispatches();
      unsubBounced();
      unsubAttendance();
    };
  }, [monthStart, monthEnd]);

  // Month navigation
  const handlePrevMonth = () => {
    const current = parseISO(`${currentMonth}-01`);
    const prev = subMonths(current, 1);
    setCurrentMonth(format(prev, "yyyy-MM"));
  };

  const handleNextMonth = () => {
    const current = parseISO(`${currentMonth}-01`);
    const next = addMonths(current, 1);
    setCurrentMonth(format(next, "yyyy-MM"));
  };

  const handleResetCurrentMonth = () => {
    const nowMonth = selectedDate ? selectedDate.slice(0, 7) : format(new Date(), "yyyy-MM");
    setCurrentMonth(nowMonth);
  };

  // Calculate Weeks in this month (Monday to Sunday)
  const monthWeeks: WeekRange[] = useMemo(() => {
    try {
      const start = parseISO(monthStart);
      const end = parseISO(monthEnd);
      const weeks: WeekRange[] = [];
      let currentDay = new Date(start);
      let weekNum = 1;

      while (currentDay <= end) {
        const weekStartStr = format(currentDay, "yyyy-MM-dd");
        // Find end of this week (Sunday or end of month)
        const dayOfWeek = currentDay.getDay(); // 0 = Sun, 1 = Mon ...
        const daysToSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
        const potentialEnd = new Date(currentDay);
        potentialEnd.setDate(currentDay.getDate() + daysToSunday);

        const weekEnd = potentialEnd > end ? end : potentialEnd;
        const weekEndStr = format(weekEnd, "yyyy-MM-dd");

        weeks.push({
          weekNum,
          startDate: weekStartStr,
          endDate: weekEndStr,
          label: `${weekNum}주차 (${format(currentDay, "M/d")}~${format(weekEnd, "M/d")})`,
        });

        // Next week start is weekEnd + 1 day
        const nextStart = new Date(weekEnd);
        nextStart.setDate(weekEnd.getDate() + 1);
        currentDay = nextStart;
        weekNum++;
      }
      return weeks;
    } catch {
      return [];
    }
  }, [monthStart, monthEnd]);

  // Helper to find which week number a date belongs to
  const getWeekNumForDate = (dateStr: string): number => {
    for (const w of monthWeeks) {
      if (dateStr >= w.startDate && dateStr <= w.endDate) {
        return w.weekNum;
      }
    }
    return 1;
  };

  // Distinct business days in the month where the office was active (attendance recorded or dispatches logged)
  const businessDates = useMemo(() => {
    const dates = new Set<string>();
    monthlyAttendance.forEach((att) => {
      if ((att.staffIds && att.staffIds.length > 0) || (att.checkInTimes && Object.keys(att.checkInTimes).length > 0)) {
        dates.add(att.date);
      }
    });
    monthlyDispatches.forEach((d) => {
      if (d.date) dates.add(d.date);
    });
    return Array.from(dates).sort();
  }, [monthlyAttendance, monthlyDispatches]);

  const totalBusinessDays = businessDates.length || 1;

  // Normalized Staff Map & Renaming
  const resolvedStaffName = (name: string) => {
    if (!staffRenameMap) return name.trim();
    return staffRenameMap.get(name.trim()) || name.trim();
  };

  // Build Comprehensive Stats by Staff
  const staffStatsList: StaffStatItem[] = useMemo(() => {
    // Group dispatches and bounced by resolved staff name
    const dispatchesByStaff: Record<string, DispatchRecord[]> = {};
    monthlyDispatches.forEach((record) => {
      const name = resolvedStaffName(record.staffName || "");
      if (!name) return;
      if (!dispatchesByStaff[name]) dispatchesByStaff[name] = [];
      dispatchesByStaff[name].push(record);
    });

    const bouncedByStaff: Record<string, BouncedRecord[]> = {};
    monthlyBounced.forEach((record) => {
      const name = resolvedStaffName(record.staffName || "");
      if (!name) return;
      if (!bouncedByStaff[name]) bouncedByStaff[name] = [];
      bouncedByStaff[name].push(record);
    });

    // Attendance dates by staff (by ID and by resolved name)
    const attendanceDatesByStaffId: Record<string, Set<string>> = {};
    const attendanceDatesByStaffName: Record<string, Set<string>> = {};

    monthlyAttendance.forEach((att) => {
      const d = att.date;
      const ids = new Set<string>([
        ...(att.staffIds || []),
        ...Object.keys(att.checkInTimes || {}),
      ]);
      ids.forEach((id) => {
        if (!attendanceDatesByStaffId[id]) attendanceDatesByStaffId[id] = new Set();
        attendanceDatesByStaffId[id].add(d);

        // match staff name
        const staffObj = staff.find((s) => s.id === id);
        if (staffObj) {
          const normName = resolvedStaffName(staffObj.name);
          if (!attendanceDatesByStaffName[normName]) attendanceDatesByStaffName[normName] = new Set();
          attendanceDatesByStaffName[normName].add(d);
        }
      });
    });

    // Also if staff had dispatches on date d, they attended on date d
    monthlyDispatches.forEach((r) => {
      const name = resolvedStaffName(r.staffName || "");
      if (name && r.date) {
        if (!attendanceDatesByStaffName[name]) attendanceDatesByStaffName[name] = new Set();
        attendanceDatesByStaffName[name].add(r.date);
      }
    });

    // Gather all staff names from:
    // 1) staff database
    // 2) dispatchesByStaff
    // 3) bouncedByStaff
    const allNamesSet = new Set<string>();
    staff.forEach((s) => allNamesSet.add(resolvedStaffName(s.name)));
    Object.keys(dispatchesByStaff).forEach((n) => allNamesSet.add(n));
    Object.keys(bouncedByStaff).forEach((n) => allNamesSet.add(n));

    const list: StaffStatItem[] = [];

    allNamesSet.forEach((name) => {
      if (!name) return;
      const staffObj =
        staff.find((s) => resolvedStaffName(s.name) === name && s.active !== false) ||
        staff.find((s) => resolvedStaffName(s.name) === name);
      const parsed = parseStaffNameAndAffiliation(name);

      const records = [...(dispatchesByStaff[name] || [])].sort((a, b) =>
        compareBusinessRecords(a.date, a.startTime || a.createdAt, b.date, b.startTime || b.createdAt)
      );
      const bounced = [...(bouncedByStaff[name] || [])].sort((a, b) =>
        compareBusinessRecords(a.date, a.time || a.createdAt, b.date, b.time || b.createdAt)
      );

      // Attendance
      const attDatesSet = new Set<string>();
      if (staffObj?.id && attendanceDatesByStaffId[staffObj.id]) {
        attendanceDatesByStaffId[staffObj.id].forEach((d) => attDatesSet.add(d));
      }
      if (attendanceDatesByStaffName[name]) {
        attendanceDatesByStaffName[name].forEach((d) => attDatesSet.add(d));
      }
      records.forEach((r) => {
        if (r.date) attDatesSet.add(r.date);
      });
      bounced.forEach((b) => {
        if (b.date) attDatesSet.add(b.date);
      });
      const attendanceDates = Array.from(attDatesSet).sort();
      const attendanceDays = attendanceDates.length;
      const attendanceRate = totalBusinessDays > 0 ? Math.min(100, Math.round((attendanceDays / totalBusinessDays) * 100)) : 0;

      // Weekly attendance breakdown
      const weeklyAttendance: Record<number, number> = {};
      monthWeeks.forEach((w) => {
        weeklyAttendance[w.weekNum] = attendanceDates.filter((d) => d >= w.startDate && d <= w.endDate).length;
      });

      // Dispatches & Units
      let monthlyTotalUnits = 0;
      let fullUnits = 0;
      let bantiCount = 0;
      let tableUnits = 0;
      let publicUnits = 0;
      let hopperUnits = 0;
      let extendedCount = 0;

      const weeklyUnits: Record<number, number> = {};
      monthWeeks.forEach((w) => {
        weeklyUnits[w.weekNum] = 0;
      });

      records.forEach((r) => {
        const units = r.durationHours || 0;
        monthlyTotalUnits += units;

        const isBanti = r.isBanti || units % 1 !== 0;
        if (isBanti) {
          bantiCount += 1;
        } else {
          fullUnits += units;
        }

        if (r.systemType === "TABLE") tableUnits += units;
        else if (r.systemType === "PUBLIC") publicUnits += units;
        else if (r.systemType === "HOPPER") hopperUnits += units;

        // Extension: durationHours >= 1.5
        if (units >= 1.5) {
          extendedCount += 1;
        }

        const wNum = getWeekNumForDate(r.date);
        weeklyUnits[wNum] = (weeklyUnits[wNum] || 0) + units;
      });

      const dispatchCount = records.length;
      const bounceCount = bounced.length;
      const totalAttempts = dispatchCount + bounceCount;
      const choiceRate = totalAttempts > 0 ? Math.round((dispatchCount / totalAttempts) * 100) : 0;
      const extensionRate = dispatchCount > 0 ? Math.round((extendedCount / dispatchCount) * 100) : 0;
      const avgUnitsPerDay = attendanceDays > 0 ? Number((monthlyTotalUnits / attendanceDays).toFixed(1)) : 0;

      const isDirect = staffObj ? staffObj.employmentType !== "DELEGATED" && parsed.isDirect : parsed.isDirect;
      const affiliation = parsed.affiliation || "직속";
      const category = (staffObj?.type === "HOPPER" ? "하퍼" : staffObj?.type === "PUBLIC" ? "퍼블릭" : parsed.category) as "하퍼" | "퍼블릭" | "커피";

      list.push({
        staffId: staffObj?.id || name,
        name,
        affiliation,
        isDirect,
        category,
        employmentType: isDirect ? "DIRECT" : "DELEGATED",
        attendanceDays,
        attendanceRate,
        attendanceDates,
        weeklyAttendance,
        dispatchCount,
        bounceCount,
        totalAttempts,
        choiceRate,
        extendedCount,
        extensionRate,
        monthlyTotalUnits: Number(monthlyTotalUnits.toFixed(1)),
        fullUnits,
        bantiCount,
        weeklyUnits,
        avgUnitsPerDay,
        tableUnits: Number(tableUnits.toFixed(1)),
        publicUnits: Number(publicUnits.toFixed(1)),
        hopperUnits: Number(hopperUnits.toFixed(1)),
        records,
        bouncedRecords: bounced,
      });
    });

    return list;
  }, [
    staff,
    monthlyDispatches,
    monthlyBounced,
    monthlyAttendance,
    totalBusinessDays,
    monthWeeks,
    staffRenameMap,
  ]);

  // Extract distinct affiliations for filter
  const distinctAffiliations = useMemo(() => {
    const set = new Set<string>();
    staffStatsList.forEach((s) => {
      if (s.affiliation && s.affiliation !== "직속") {
        set.add(s.affiliation);
      }
    });
    return Array.from(set).sort();
  }, [staffStatsList]);

  // Filtered & Sorted Staff List
  const filteredAndSortedStaff = useMemo(() => {
    let result = staffStatsList.filter((item) => {
      // Exclude staff with zero activity across attendance, dispatches, and bounces unless searching
      const hasActivity = item.attendanceDays > 0 || item.dispatchCount > 0 || item.bounceCount > 0;
      if (!hasActivity && !searchTerm) return false;

      // Search
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchName = item.name.toLowerCase().includes(term);
        const matchAff = item.affiliation.toLowerCase().includes(term);
        if (!matchName && !matchAff) return false;
      }

      // Affiliation
      if (selectedAffiliation === "DIRECT") {
        if (!item.isDirect) return false;
      } else if (selectedAffiliation !== "ALL") {
        if (item.affiliation !== selectedAffiliation) return false;
      }

      // Employment
      if (selectedEmployment === "DIRECT" && !item.isDirect) return false;
      if (selectedEmployment === "DELEGATED" && item.isDirect) return false;

      // Category
      if (selectedCategory !== "ALL" && item.category !== selectedCategory) return false;

      return true;
    });

    // Sorting
    result.sort((a, b) => {
      let comparison = 0;
      if (sortBy === "units") {
        comparison = b.monthlyTotalUnits - a.monthlyTotalUnits;
        if (comparison === 0) comparison = b.dispatchCount - a.dispatchCount;
      } else if (sortBy === "attendance") {
        comparison = b.attendanceRate - a.attendanceRate;
        if (comparison === 0) comparison = b.attendanceDays - a.attendanceDays;
      } else if (sortBy === "choice") {
        comparison = b.choiceRate - a.choiceRate;
        if (comparison === 0) comparison = b.totalAttempts - a.totalAttempts;
      } else if (sortBy === "extension") {
        comparison = b.extensionRate - a.extensionRate;
        if (comparison === 0) comparison = b.extendedCount - a.extendedCount;
      } else if (sortBy === "avgUnits") {
        comparison = b.avgUnitsPerDay - a.avgUnitsPerDay;
      } else if (sortBy === "name") {
        comparison = a.name.localeCompare(b.name, "ko");
      }

      return sortDirection === "desc" ? comparison : -comparison;
    });

    return result;
  }, [
    staffStatsList,
    searchTerm,
    selectedAffiliation,
    selectedEmployment,
    selectedCategory,
    sortBy,
    sortDirection,
  ]);

  // Overall KPIs for the month
  const overallKPIs = useMemo(() => {
    let totalUnits = 0;
    let totalDispatches = 0;
    let totalBounces = 0;
    let totalExtended = 0;
    let totalTableUnits = 0;
    let totalPublicUnits = 0;
    let totalHopperUnits = 0;

    monthlyDispatches.forEach((r) => {
      const u = r.durationHours || 0;
      totalUnits += u;
      totalDispatches += 1;
      if (u >= 1.5) totalExtended += 1;
      if (r.systemType === "TABLE") totalTableUnits += u;
      else if (r.systemType === "PUBLIC") totalPublicUnits += u;
      else if (r.systemType === "HOPPER") totalHopperUnits += u;
    });

    totalBounces = monthlyBounced.length;
    const totalChoiceAttempts = totalDispatches + totalBounces;
    const avgChoiceRate = totalChoiceAttempts > 0 ? Math.round((totalDispatches / totalChoiceAttempts) * 100) : 0;
    const avgExtensionRate = totalDispatches > 0 ? Math.round((totalExtended / totalDispatches) * 100) : 0;

    // Active staff attendance average
    const activeStaff = staffStatsList.filter((s) => s.attendanceDays > 0 || s.dispatchCount > 0);
    const totalAttDaysSum = activeStaff.reduce((sum, s) => sum + s.attendanceDays, 0);
    const avgAttDays = activeStaff.length > 0 ? Number((totalAttDaysSum / activeStaff.length).toFixed(1)) : 0;
    const avgAttRate = totalBusinessDays > 0 ? Math.round((avgAttDays / totalBusinessDays) * 100) : 0;

    // Top MVPs
    const sortedByUnits = [...activeStaff].sort((a, b) => b.monthlyTotalUnits - a.monthlyTotalUnits);
    const topUnitsStaff = sortedByUnits[0] || null;

    const sortedByChoice = [...activeStaff]
      .filter((s) => s.totalAttempts >= 3)
      .sort((a, b) => b.choiceRate - a.choiceRate);
    const topChoiceStaff = sortedByChoice[0] || null;

    const sortedByExtension = [...activeStaff]
      .filter((s) => s.dispatchCount >= 3)
      .sort((a, b) => b.extensionRate - a.extensionRate);
    const topExtensionStaff = sortedByExtension[0] || null;

    const sortedByAttendance = [...activeStaff].sort((a, b) => b.attendanceDays - a.attendanceDays);
    const topAttendanceStaff = sortedByAttendance[0] || null;

    return {
      totalUnits: Number(totalUnits.toFixed(1)),
      totalDispatches,
      totalBounces,
      totalExtended,
      totalChoiceAttempts,
      avgChoiceRate,
      avgExtensionRate,
      avgAttDays,
      avgAttRate,
      activeStaffCount: activeStaff.length,
      totalTableUnits: Number(totalTableUnits.toFixed(1)),
      totalPublicUnits: Number(totalPublicUnits.toFixed(1)),
      totalHopperUnits: Number(totalHopperUnits.toFixed(1)),
      topUnitsStaff,
      topChoiceStaff,
      topExtensionStaff,
      topAttendanceStaff,
    };
  }, [monthlyDispatches, monthlyBounced, staffStatsList, totalBusinessDays]);

  // Weekly aggregate trend
  const weeklyAggregates = useMemo(() => {
    return monthWeeks.map((week) => {
      let weekUnits = 0;
      let weekDispatches = 0;
      let weekExtended = 0;
      let weekBounces = 0;
      const weekStaffSet = new Set<string>();

      monthlyDispatches.forEach((r) => {
        if (r.date >= week.startDate && r.date <= week.endDate) {
          const u = r.durationHours || 0;
          weekUnits += u;
          weekDispatches += 1;
          if (u >= 1.5) weekExtended += 1;
          if (r.staffName) weekStaffSet.add(resolvedStaffName(r.staffName));
        }
      });

      monthlyBounced.forEach((b) => {
        if (b.date >= week.startDate && b.date <= week.endDate) {
          weekBounces += 1;
        }
      });

      monthlyAttendance.forEach((att) => {
        if (att.date >= week.startDate && att.date <= week.endDate) {
          (att.staffIds || []).forEach((id) => weekStaffSet.add(id));
        }
      });

      const totalAttempts = weekDispatches + weekBounces;
      const choiceRate = totalAttempts > 0 ? Math.round((weekDispatches / totalAttempts) * 100) : 0;
      const extRate = weekDispatches > 0 ? Math.round((weekExtended / weekDispatches) * 100) : 0;

      return {
        ...week,
        units: Number(weekUnits.toFixed(1)),
        dispatches: weekDispatches,
        extended: weekExtended,
        bounces: weekBounces,
        activeStaffCount: weekStaffSet.size,
        choiceRate,
        extRate,
      };
    });
  }, [monthWeeks, monthlyDispatches, monthlyBounced, monthlyAttendance]);

  // Image Capture Handler
  const handleCaptureImage = async () => {
    if (!captureRef.current) return;
    try {
      setIsCapturing(true);
      const dataUrl = await htmlToImage.toPng(captureRef.current, {
        backgroundColor: "#f8fafc",
        pixelRatio: 2,
        style: {
          transform: "none",
        },
      });

      const filename = `직원통계_${currentMonth}_${format(new Date(), "yyyyMMdd_HHmm")}.png`;

      // Web Share API if mobile
      if (navigator.canShare && navigator.share) {
        try {
          const blob = await (await fetch(dataUrl)).blob();
          const file = new File([blob], filename, { type: "image/png" });
          await navigator.share({
            title: `${currentMonth} 직원 통계 현황`,
            text: `[${currentMonth}] 출근율 · 초이스율 · 연장율 · 주별/월별 갯수 통계`,
            files: [file],
          });
          setIsCapturing(false);
          return;
        } catch {
          // fallback to download
        }
      }

      // Download anchor fallback
      const link = document.createElement("a");
      link.download = filename;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("통계 캡처 오류:", err);
      alert("이미지 생성 중 오류가 발생했습니다.");
    } finally {
      setIsCapturing(false);
    }
  };

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortDirection((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(field);
      setSortDirection("desc");
    }
  };

  const formattedMonthTitle = useMemo(() => {
    try {
      const date = parseISO(`${currentMonth}-01`);
      return format(date, "yyyy년 M월", { locale: ko });
    } catch {
      return currentMonth;
    }
  }, [currentMonth]);

  return (
    <div className="space-y-6">
      {/* 1. Header Toolbar & Controls */}
      <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Month Selector */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-stone-100 rounded-2xl p-1 shadow-inner border border-stone-200/80">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-2 rounded-xl text-stone-600 hover:bg-white hover:text-stone-900 transition-all cursor-pointer active:scale-95"
              title="이전 달"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="px-3 sm:px-4 py-1 flex items-center gap-2 font-black text-stone-900 text-sm sm:text-base">
              <Calendar className="w-4 h-4 text-indigo-600" />
              <span>{formattedMonthTitle}</span>
              <span className="text-[11px] font-bold text-stone-500 bg-stone-200/60 px-2 py-0.5 rounded-full">
                영업 {totalBusinessDays}일
              </span>
            </div>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-2 rounded-xl text-stone-600 hover:bg-white hover:text-stone-900 transition-all cursor-pointer active:scale-95"
              title="다음 달"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleResetCurrentMonth}
            className="px-3 py-2 rounded-2xl text-xs font-bold bg-stone-100 text-stone-700 hover:bg-stone-200 transition-all cursor-pointer whitespace-nowrap"
          >
            이번 달
          </button>
        </div>

        {/* Action Controls: View Switch & Image Capture */}
        <div className="flex items-center gap-2 justify-end flex-wrap">
          {/* View Mode (Table vs Card) */}
          <div className="flex bg-stone-100 p-1 rounded-xl border border-stone-200">
            <button
              type="button"
              onClick={() => setViewLayout("table")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
                viewLayout === "table"
                  ? "bg-white shadow-xs text-indigo-700 font-black"
                  : "text-stone-500 hover:text-stone-700"
              )}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>표 보기</span>
            </button>
            <button
              type="button"
              onClick={() => setViewLayout("card")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
                viewLayout === "card"
                  ? "bg-white shadow-xs text-indigo-700 font-black"
                  : "text-stone-500 hover:text-stone-700"
              )}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>카드 보기</span>
            </button>
          </div>

          {/* Capture Image Button */}
          <button
            type="button"
            onClick={handleCaptureImage}
            disabled={isCapturing}
            className="h-10 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
            title="현재 통계표를 고화질 이미지로 저장하거나 공유합니다"
          >
            {isCapturing ? (
              <>
                <Clock className="w-4 h-4 animate-spin" />
                <span>저장 중...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>이미지 저장</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Printable / Capturable Area */}
      <div ref={captureRef} id="stats-dashboard-container" className="space-y-6">
        {/* Header Badge for Captured Output */}
        <div className="hidden print:block text-center py-4 border-b border-stone-200">
          <h1 className="text-2xl font-black text-stone-900">{formattedMonthTitle} 직원 종합 통계 리포트</h1>
          <p className="text-xs text-stone-500 mt-1">출근율 · 초이스율 · 연장율 · 주별 및 월별 갯수 현황 (총 영업일 {totalBusinessDays}일)</p>
        </div>

        {/* 2. Top KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* KPI 1: 총 갯수 */}
          <div className="bg-gradient-to-br from-indigo-50/80 to-white p-4 sm:p-5 rounded-3xl border border-indigo-100/90 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-indigo-600 flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-indigo-600" />
                이번 달 총 갯수
              </span>
              <span className="text-[10px] font-black bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                {overallKPIs.totalDispatches}건 진행
              </span>
            </div>
            <div className="my-1">
              <div className="text-2xl sm:text-3xl font-black text-indigo-950 tracking-tight">
                {overallKPIs.totalUnits.toLocaleString()}
                <span className="text-sm sm:text-base font-bold text-indigo-700 ml-1">개</span>
              </div>
            </div>
            <div className="text-[10.5px] text-stone-500 flex items-center gap-1.5 font-medium border-t border-indigo-100/60 pt-2 mt-1">
              <span>하퍼 <b className="text-indigo-900">{overallKPIs.totalHopperUnits}</b></span>
              <span className="text-stone-300">·</span>
              <span>퍼블릭 <b className="text-indigo-900">{overallKPIs.totalPublicUnits}</b></span>
              <span className="text-stone-300">·</span>
              <span>커피 <b className="text-indigo-900">{overallKPIs.totalTableUnits}</b></span>
            </div>
          </div>

          {/* KPI 2: 평균 출근율 */}
          <div className="bg-gradient-to-br from-emerald-50/80 to-white p-4 sm:p-5 rounded-3xl border border-emerald-100/90 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-emerald-600 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                전체 평균 출근율
              </span>
              <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                활동 {overallKPIs.activeStaffCount}명
              </span>
            </div>
            <div className="my-1 flex items-baseline gap-2">
              <div className="text-2xl sm:text-3xl font-black text-emerald-950 tracking-tight">
                {overallKPIs.avgAttRate}
                <span className="text-sm sm:text-base font-bold text-emerald-700 ml-0.5">%</span>
              </div>
              <span className="text-xs text-stone-500 font-bold">
                (평균 {overallKPIs.avgAttDays}일 / {totalBusinessDays}일)
              </span>
            </div>
            <div className="w-full bg-emerald-100 rounded-full h-1.5 overflow-hidden mt-1">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, overallKPIs.avgAttRate)}%` }}
              />
            </div>
          </div>

          {/* KPI 3: 평균 초이스율 */}
          <div className="bg-gradient-to-br from-rose-50/80 to-white p-4 sm:p-5 rounded-3xl border border-rose-100/90 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-rose-600 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-rose-600" />
                평균 초이스율
              </span>
              <span className="text-[10px] font-black bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full">
                총 {overallKPIs.totalChoiceAttempts}회 시도
              </span>
            </div>
            <div className="my-1 flex items-baseline gap-2">
              <div className="text-2xl sm:text-3xl font-black text-rose-950 tracking-tight">
                {overallKPIs.avgChoiceRate}
                <span className="text-sm sm:text-base font-bold text-rose-700 ml-0.5">%</span>
              </div>
              <span className="text-xs text-stone-500 font-bold">
                (진행 {overallKPIs.totalDispatches} / 튕김 {overallKPIs.totalBounces})
              </span>
            </div>
            <div className="w-full bg-rose-100 rounded-full h-1.5 overflow-hidden mt-1">
              <div
                className="bg-rose-500 h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, overallKPIs.avgChoiceRate)}%` }}
              />
            </div>
          </div>

          {/* KPI 4: 평균 연장율 */}
          <div className="bg-gradient-to-br from-amber-50/80 to-white p-4 sm:p-5 rounded-3xl border border-amber-100/90 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-amber-600 flex items-center gap-1.5">
                <Timer className="w-4 h-4 text-amber-600" />
                평균 연장율 (1.5h+)
              </span>
              <span className="text-[10px] font-black bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                {overallKPIs.totalExtended}건 연장
              </span>
            </div>
            <div className="my-1 flex items-baseline gap-2">
              <div className="text-2xl sm:text-3xl font-black text-amber-950 tracking-tight">
                {overallKPIs.avgExtensionRate}
                <span className="text-sm sm:text-base font-bold text-amber-700 ml-0.5">%</span>
              </div>
              <span className="text-xs text-stone-500 font-bold">
                (진행 {overallKPIs.totalDispatches}건 중)
              </span>
            </div>
            <div className="w-full bg-amber-100 rounded-full h-1.5 overflow-hidden mt-1">
              <div
                className="bg-amber-500 h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, overallKPIs.avgExtensionRate)}%` }}
              />
            </div>
          </div>
        </div>

        {/* 3. Top Performers Hall of Fame */}
        <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-black text-stone-800 flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-500" />
              <span>이달의 명예의 전당 (TOP 부문별 1위)</span>
            </h3>
            <span className="text-[11px] font-medium text-stone-400">
              * 초이스/연장율은 3건 이상 활동자 기준
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* MVP 1: 갯수 1위 */}
            <div
              onClick={() => overallKPIs.topUnitsStaff && handleOpenStaffDetail(overallKPIs.topUnitsStaff)}
              className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/80 hover:border-amber-300 transition-all cursor-pointer flex flex-col justify-between group"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-black text-amber-800 flex items-center gap-1">
                  👑 최다 갯수 1위
                </span>
                <span className="text-[9px] bg-amber-200/60 text-amber-900 px-1.5 py-0.5 rounded font-bold">MVP</span>
              </div>
              <div className="my-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm sm:text-base font-black text-stone-900 group-hover:text-amber-700 transition-colors">
                    {overallKPIs.topUnitsStaff ? overallKPIs.topUnitsStaff.name : "-"}
                  </span>
                  {overallKPIs.topUnitsStaff && (
                    <span
                      className={cn(
                        "px-1.5 py-0.2 rounded text-[8.5px] font-black text-white shrink-0 leading-none shadow-2xs",
                        overallKPIs.topUnitsStaff.isDirect ? "bg-amber-500" : "bg-purple-600"
                      )}
                    >
                      {overallKPIs.topUnitsStaff.affiliation}
                    </span>
                  )}
                </div>
                <div className="text-xs font-black text-amber-700 mt-0.5">
                  {overallKPIs.topUnitsStaff ? `${overallKPIs.topUnitsStaff.monthlyTotalUnits}개` : "-"}
                  <span className="text-[10px] font-normal text-stone-500 ml-1">
                    ({overallKPIs.topUnitsStaff?.dispatchCount}건)
                  </span>
                </div>
              </div>
              <div className="text-[9.5px] text-stone-400 truncate">
                {overallKPIs.topUnitsStaff ? `${overallKPIs.topUnitsStaff.affiliation} · 일평균 ${overallKPIs.topUnitsStaff.avgUnitsPerDay}개` : ""}
              </div>
            </div>

            {/* MVP 2: 초이스율 1위 */}
            <div
              onClick={() => overallKPIs.topChoiceStaff && handleOpenStaffDetail(overallKPIs.topChoiceStaff)}
              className="p-3.5 rounded-2xl bg-rose-50/70 border border-rose-200/80 hover:border-rose-300 transition-all cursor-pointer flex flex-col justify-between group"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-black text-rose-800 flex items-center gap-1">
                  🎯 초이스 에이스 1위
                </span>
                <span className="text-[9px] bg-rose-200/60 text-rose-900 px-1.5 py-0.5 rounded font-bold">ACE</span>
              </div>
              <div className="my-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm sm:text-base font-black text-stone-900 group-hover:text-rose-700 transition-colors">
                    {overallKPIs.topChoiceStaff ? overallKPIs.topChoiceStaff.name : "-"}
                  </span>
                  {overallKPIs.topChoiceStaff && (
                    <span
                      className={cn(
                        "px-1.5 py-0.2 rounded text-[8.5px] font-black text-white shrink-0 leading-none shadow-2xs",
                        overallKPIs.topChoiceStaff.isDirect ? "bg-amber-500" : "bg-purple-600"
                      )}
                    >
                      {overallKPIs.topChoiceStaff.affiliation}
                    </span>
                  )}
                </div>
                <div className="text-xs font-black text-rose-700 mt-0.5">
                  {overallKPIs.topChoiceStaff ? `${overallKPIs.topChoiceStaff.choiceRate}%` : "-"}
                  <span className="text-[10px] font-normal text-stone-500 ml-1">
                    ({overallKPIs.topChoiceStaff?.dispatchCount}/{overallKPIs.topChoiceStaff?.totalAttempts}회)
                  </span>
                </div>
              </div>
              <div className="text-[9.5px] text-stone-400 truncate">
                {overallKPIs.topChoiceStaff ? `${overallKPIs.topChoiceStaff.affiliation} · 튕김 ${overallKPIs.topChoiceStaff.bounceCount}회` : ""}
              </div>
            </div>

            {/* MVP 3: 연장율 1위 */}
            <div
              onClick={() => overallKPIs.topExtensionStaff && handleOpenStaffDetail(overallKPIs.topExtensionStaff)}
              className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200/80 hover:border-indigo-300 transition-all cursor-pointer flex flex-col justify-between group"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-black text-indigo-800 flex items-center gap-1">
                  ⏱️ 연장 퀸/킹 1위
                </span>
                <span className="text-[9px] bg-indigo-200/60 text-indigo-900 px-1.5 py-0.5 rounded font-bold">TOP</span>
              </div>
              <div className="my-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm sm:text-base font-black text-stone-900 group-hover:text-indigo-700 transition-colors">
                    {overallKPIs.topExtensionStaff ? overallKPIs.topExtensionStaff.name : "-"}
                  </span>
                  {overallKPIs.topExtensionStaff && (
                    <span
                      className={cn(
                        "px-1.5 py-0.2 rounded text-[8.5px] font-black text-white shrink-0 leading-none shadow-2xs",
                        overallKPIs.topExtensionStaff.isDirect ? "bg-amber-500" : "bg-purple-600"
                      )}
                    >
                      {overallKPIs.topExtensionStaff.affiliation}
                    </span>
                  )}
                </div>
                <div className="text-xs font-black text-indigo-700 mt-0.5">
                  {overallKPIs.topExtensionStaff ? `${overallKPIs.topExtensionStaff.extensionRate}%` : "-"}
                  <span className="text-[10px] font-normal text-stone-500 ml-1">
                    ({overallKPIs.topExtensionStaff?.extendedCount}/{overallKPIs.topExtensionStaff?.dispatchCount}건)
                  </span>
                </div>
              </div>
              <div className="text-[9.5px] text-stone-400 truncate">
                {overallKPIs.topExtensionStaff ? `${overallKPIs.topExtensionStaff.affiliation} · 1.5시간 이상 유지` : ""}
              </div>
            </div>

            {/* MVP 4: 최다 출근 1위 */}
            <div
              onClick={() => overallKPIs.topAttendanceStaff && handleOpenStaffDetail(overallKPIs.topAttendanceStaff)}
              className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 hover:border-emerald-300 transition-all cursor-pointer flex flex-col justify-between group"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-black text-emerald-800 flex items-center gap-1">
                  🌟 최다 출근 개근상
                </span>
                <span className="text-[9px] bg-emerald-200/60 text-emerald-900 px-1.5 py-0.5 rounded font-bold">PERFECT</span>
              </div>
              <div className="my-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm sm:text-base font-black text-stone-900 group-hover:text-emerald-700 transition-colors">
                    {overallKPIs.topAttendanceStaff ? overallKPIs.topAttendanceStaff.name : "-"}
                  </span>
                  {overallKPIs.topAttendanceStaff && (
                    <span
                      className={cn(
                        "px-1.5 py-0.2 rounded text-[8.5px] font-black text-white shrink-0 leading-none shadow-2xs",
                        overallKPIs.topAttendanceStaff.isDirect ? "bg-amber-500" : "bg-purple-600"
                      )}
                    >
                      {overallKPIs.topAttendanceStaff.affiliation}
                    </span>
                  )}
                </div>
                <div className="text-xs font-black text-emerald-700 mt-0.5">
                  {overallKPIs.topAttendanceStaff ? `${overallKPIs.topAttendanceStaff.attendanceDays}일 출근` : "-"}
                  <span className="text-[10px] font-normal text-stone-500 ml-1">
                    ({overallKPIs.topAttendanceStaff?.attendanceRate}%)
                  </span>
                </div>
              </div>
              <div className="text-[9.5px] text-stone-400 truncate">
                {overallKPIs.topAttendanceStaff ? `${overallKPIs.topAttendanceStaff.affiliation} · 총 ${totalBusinessDays}영업일 중` : ""}
              </div>
            </div>
          </div>
        </div>

        {/* 4. Weekly Breakdown Trend Bar */}
        <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <h3 className="text-sm font-black text-stone-800 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-600" />
              <span>주차별 총 갯수 및 활동 현황</span>
            </h3>
            <span className="text-xs font-bold text-stone-500">
              월간 총 {overallKPIs.totalUnits}개 / {monthWeeks.length}개 주차
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {weeklyAggregates.map((w) => {
              const pctOfTotal = overallKPIs.totalUnits > 0 ? Math.round((w.units / overallKPIs.totalUnits) * 100) : 0;
              return (
                <div
                  key={w.weekNum}
                  className="bg-stone-50/90 rounded-2xl p-3 border border-stone-200 flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-black text-stone-800">{w.weekNum}주차</span>
                    <span className="text-[9.5px] font-bold text-stone-500">
                      {w.label.slice(w.label.indexOf("(") + 1, -1)}
                    </span>
                  </div>

                  <div className="my-1">
                    <div className="text-xl font-black text-indigo-900 tracking-tight">
                      {w.units}
                      <span className="text-xs font-bold text-indigo-700 ml-0.5">개</span>
                    </div>
                    <div className="text-[10px] text-stone-500 font-medium mt-0.5">
                      {w.dispatches}건 진행 · 활동 {w.activeStaffCount}명
                    </div>
                  </div>

                  {/* Micro Progress */}
                  <div className="mt-2 pt-2 border-t border-stone-200/70">
                    <div className="flex items-center justify-between text-[9.5px] font-bold text-stone-600 mb-1">
                      <span>초이스 {w.choiceRate}%</span>
                      <span>연장 {w.extRate}%</span>
                    </div>
                    <div className="w-full bg-stone-200 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-indigo-600 h-full rounded-full"
                        style={{ width: `${pctOfTotal}%` }}
                        title={`전체의 ${pctOfTotal}%`}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 5. Filter & Search Controls */}
        <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="직원 이름 또는 소속 검색 (예: 시아, 베리, 시크)..."
                className="w-full h-10 pl-9 pr-8 text-xs sm:text-sm rounded-xl bg-stone-50 border border-stone-200 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all font-medium"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Quick Sort Options */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
              <span className="text-[11px] font-bold text-stone-400 mr-1 shrink-0 flex items-center gap-1">
                <ArrowUpDown className="w-3 h-3" /> 정렬:
              </span>
              {[
                { key: "units", label: "총갯수순" },
                { key: "attendance", label: "출근율순" },
                { key: "choice", label: "초이스율순" },
                { key: "extension", label: "연장율순" },
                { key: "avgUnits", label: "일평균순" },
                { key: "name", label: "이름순" },
              ].map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => toggleSort(s.key as any)}
                  className={cn(
                    "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0",
                    sortBy === s.key
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                  )}
                >
                  {s.label}
                  {sortBy === s.key && (sortDirection === "desc" ? " ↓" : " ↑")}
                </button>
              ))}
            </div>
          </div>

          {/* Affiliation & Category Filter Chips */}
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-stone-100">
            <span className="text-[11px] font-bold text-stone-400 mr-1 flex items-center gap-1 shrink-0">
              <Building2 className="w-3 h-3" /> 소속:
            </span>
            <button
              type="button"
              onClick={() => setSelectedAffiliation("ALL")}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer",
                selectedAffiliation === "ALL"
                  ? "bg-stone-900 text-white"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              )}
            >
              전체 ({staffStatsList.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedAffiliation("DIRECT")}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer",
                selectedAffiliation === "DIRECT"
                  ? "bg-indigo-600 text-white"
                  : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
              )}
            >
              직속만
            </button>
            {distinctAffiliations.map((aff) => (
              <button
                key={aff}
                type="button"
                onClick={() => setSelectedAffiliation(aff)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer",
                  selectedAffiliation === aff
                    ? "bg-purple-600 text-white"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                )}
              >
                {aff}
              </button>
            ))}

            <div className="h-4 w-px bg-stone-200 mx-1.5" />

            {/* Category Filter */}
            <span className="text-[11px] font-bold text-stone-400 mr-1 shrink-0">유형:</span>
            {["ALL", "하퍼", "퍼블릭", "커피"].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer",
                  selectedCategory === cat
                    ? "bg-emerald-700 text-white"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                )}
              >
                {cat === "ALL" ? "전체유형" : cat}
              </button>
            ))}
          </div>
        </div>

        {/* 6. Main Data Display: Table or Card View */}
        {isLoading ? (
          <div className="bg-white rounded-3xl p-16 text-center border border-stone-200">
            <div className="w-10 h-10 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm font-bold text-stone-600">{formattedMonthTitle} 통계 데이터를 불러오는 중입니다...</p>
          </div>
        ) : filteredAndSortedStaff.length === 0 ? (
          <div className="bg-white rounded-3xl p-16 text-center border border-stone-200">
            <Users className="w-10 h-10 text-stone-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-stone-600">조건에 일치하는 직원 통계 내역이 없습니다.</p>
            <p className="text-xs text-stone-400 mt-1">검색어나 필터 조건을 변경해 보세요.</p>
          </div>
        ) : viewLayout === "table" ? (
          /* Table View */
          <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[850px]">
                <thead>
                  <tr className="bg-stone-50/90 border-b border-stone-200 text-[11px] font-black text-stone-500 uppercase tracking-wider">
                    <th className="py-3 px-3 text-center w-12">순위</th>
                    <th className="py-3 px-4 min-w-[140px]">직원명 / 소속</th>
                    <th className="py-3 px-3 text-center min-w-[110px]">
                      <button
                        type="button"
                        onClick={() => toggleSort("attendance")}
                        className="inline-flex items-center gap-1 hover:text-stone-900 cursor-pointer"
                      >
                        출근율 (일수)
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-3 px-3 text-center min-w-[120px]">
                      <button
                        type="button"
                        onClick={() => toggleSort("choice")}
                        className="inline-flex items-center gap-1 hover:text-stone-900 cursor-pointer"
                      >
                        초이스율 (진행/시도)
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-3 px-3 text-center min-w-[110px]">
                      <button
                        type="button"
                        onClick={() => toggleSort("extension")}
                        className="inline-flex items-center gap-1 hover:text-stone-900 cursor-pointer"
                      >
                        연장율 (1.5h+)
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    {monthWeeks.map((w) => (
                      <th key={w.weekNum} className="py-3 px-2 text-center text-[10px] w-14">
                        {w.weekNum}주차
                      </th>
                    ))}
                    <th className="py-3 px-4 text-right min-w-[120px]">
                      <button
                        type="button"
                        onClick={() => toggleSort("units")}
                        className="inline-flex items-center gap-1 hover:text-stone-900 cursor-pointer ml-auto"
                      >
                        이번달 총 갯수
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-3 px-3 text-center w-20">상세</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-xs">
                  {filteredAndSortedStaff.map((staffItem, idx) => {
                    const rank = idx + 1;
                    return (
                      <tr
                        key={staffItem.name}
                        onClick={() => handleOpenStaffDetail(staffItem)}
                        className="hover:bg-indigo-50/30 transition-colors cursor-pointer group"
                      >
                        {/* Rank */}
                        <td className="py-3 px-3 text-center">
                          {rank === 1 ? (
                            <span className="w-6 h-6 rounded-full bg-amber-400 text-amber-950 font-black text-xs inline-flex items-center justify-center shadow-xs">
                              🥇
                            </span>
                          ) : rank === 2 ? (
                            <span className="w-6 h-6 rounded-full bg-slate-300 text-slate-900 font-black text-xs inline-flex items-center justify-center shadow-xs">
                              🥈
                            </span>
                          ) : rank === 3 ? (
                            <span className="w-6 h-6 rounded-full bg-amber-600 text-white font-black text-xs inline-flex items-center justify-center shadow-xs">
                              🥉
                            </span>
                          ) : (
                            <span className="text-stone-400 font-bold text-xs">{rank}</span>
                          )}
                        </td>

                        {/* Staff Name & Affiliation */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-black text-stone-900 text-xs sm:text-sm group-hover:text-indigo-600 transition-colors">
                              {staffItem.name}
                            </span>
                            {staffItem.isDirect ? (
                              <span className="px-1.5 py-0.5 rounded text-[8.5px] font-black bg-amber-500 text-white shadow-2xs">
                                직속
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[8.5px] font-black bg-purple-600 text-white shadow-2xs">
                                {staffItem.affiliation}
                              </span>
                            )}
                            <span className="text-[9px] text-stone-400 font-medium">
                              ({staffItem.category})
                            </span>
                          </div>
                        </td>

                        {/* Attendance Rate */}
                        <td className="py-3 px-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <div className="flex items-center gap-1">
                              <span
                                className={cn(
                                  "font-black text-xs",
                                  staffItem.attendanceRate >= 80
                                    ? "text-emerald-600"
                                    : staffItem.attendanceRate >= 50
                                    ? "text-stone-800"
                                    : "text-stone-400"
                                )}
                              >
                                {staffItem.attendanceRate}%
                              </span>
                              <span className="text-[10px] text-stone-400 font-medium">
                                ({staffItem.attendanceDays}/{totalBusinessDays}일)
                              </span>
                            </div>
                            <div className="w-16 bg-stone-100 rounded-full h-1 overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  staffItem.attendanceRate >= 80
                                    ? "bg-emerald-500"
                                    : staffItem.attendanceRate >= 50
                                    ? "bg-blue-500"
                                    : "bg-stone-300"
                                )}
                                style={{ width: `${staffItem.attendanceRate}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Choice Rate */}
                        <td className="py-3 px-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <div className="flex items-center gap-1">
                              <span
                                className={cn(
                                  "font-black text-xs",
                                  staffItem.choiceRate >= 80
                                    ? "text-rose-600"
                                    : staffItem.choiceRate >= 50
                                    ? "text-amber-600"
                                    : "text-stone-400"
                                )}
                              >
                                {staffItem.totalAttempts > 0 ? `${staffItem.choiceRate}%` : "-"}
                              </span>
                              <span className="text-[10px] text-stone-400 font-medium">
                                ({staffItem.dispatchCount}/{staffItem.totalAttempts}회)
                              </span>
                            </div>
                            {staffItem.totalAttempts > 0 && (
                              <div className="w-16 bg-stone-100 rounded-full h-1 overflow-hidden">
                                <div
                                  className={cn(
                                    "h-full rounded-full",
                                    staffItem.choiceRate >= 80
                                      ? "bg-rose-500"
                                      : staffItem.choiceRate >= 50
                                      ? "bg-amber-500"
                                      : "bg-stone-300"
                                )}
                                  style={{ width: `${staffItem.choiceRate}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Extension Rate */}
                        <td className="py-3 px-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <div className="flex items-center gap-1">
                              <span
                                className={cn(
                                  "font-black text-xs",
                                  staffItem.extensionRate >= 50
                                    ? "text-indigo-600"
                                    : "text-stone-700"
                                )}
                              >
                                {staffItem.dispatchCount > 0 ? `${staffItem.extensionRate}%` : "-"}
                              </span>
                              <span className="text-[10px] text-stone-400 font-medium">
                                ({staffItem.extendedCount}/{staffItem.dispatchCount}건)
                              </span>
                            </div>
                            {staffItem.dispatchCount > 0 && (
                              <div className="w-16 bg-stone-100 rounded-full h-1 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-indigo-500"
                                  style={{ width: `${staffItem.extensionRate}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Weekly Units Columns */}
                        {monthWeeks.map((w) => {
                          const wUnits = staffItem.weeklyUnits[w.weekNum] || 0;
                          return (
                            <td
                              key={w.weekNum}
                              className={cn(
                                "py-3 px-2 text-center text-xs font-bold",
                                wUnits > 0 ? "text-stone-800" : "text-stone-300"
                              )}
                            >
                              {wUnits > 0 ? wUnits : "-"}
                            </td>
                          );
                        })}

                        {/* Monthly Total Units */}
                        <td className="py-3 px-4 text-right">
                          <div className="text-sm sm:text-base font-black text-stone-900 tracking-tight">
                            {staffItem.monthlyTotalUnits}
                            <span className="text-xs font-bold text-stone-500 ml-0.5">개</span>
                          </div>
                          <div className="text-[10px] text-stone-400 font-medium">
                            일평균 {staffItem.avgUnitsPerDay}개 · 총 {staffItem.dispatchCount}건
                          </div>
                        </td>

                        {/* Detail Button */}
                        <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => handleOpenStaffDetail(staffItem)}
                            className="px-2 py-1 rounded-lg bg-stone-100 hover:bg-indigo-600 hover:text-white text-stone-600 text-[11px] font-bold transition-all cursor-pointer"
                          >
                            상세
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Card View */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAndSortedStaff.map((staffItem, idx) => {
              const rank = idx + 1;
              return (
                <div
                  key={staffItem.name}
                  onClick={() => handleOpenStaffDetail(staffItem)}
                  className="bg-white rounded-3xl p-5 border border-stone-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer flex flex-col justify-between group"
                >
                  <div>
                    {/* Card Header: Rank & Name */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "w-6 h-6 rounded-full font-black text-xs flex items-center justify-center",
                            rank === 1
                              ? "bg-amber-400 text-amber-950"
                              : rank === 2
                              ? "bg-slate-300 text-slate-900"
                              : rank === 3
                              ? "bg-amber-600 text-white"
                              : "bg-stone-100 text-stone-600"
                          )}
                        >
                          {rank}
                        </span>
                        <div>
                          <div className="font-black text-stone-900 text-sm sm:text-base group-hover:text-indigo-600 transition-colors">
                            {staffItem.name}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            {staffItem.isDirect ? (
                              <span className="px-1.5 py-0.5 rounded text-[8.5px] font-black bg-amber-500 text-white shadow-2xs">
                                직속
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[8.5px] font-black bg-purple-600 text-white shadow-2xs">
                                {staffItem.affiliation}
                              </span>
                            )}
                            <span className="text-[9.5px] text-stone-400 font-medium">
                              {staffItem.category}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Total Units Highlight */}
                      <div className="text-right">
                        <div className="text-xl font-black text-indigo-950 leading-none">
                          {staffItem.monthlyTotalUnits}
                          <span className="text-xs font-bold text-indigo-700 ml-0.5">개</span>
                        </div>
                        <div className="text-[9.5px] text-stone-400 font-medium mt-0.5">
                          일평균 {staffItem.avgUnitsPerDay}개
                        </div>
                      </div>
                    </div>

                    {/* Metric Badges Grid */}
                    <div className="grid grid-cols-3 gap-1.5 bg-stone-50 p-2.5 rounded-2xl border border-stone-100 text-center mb-3">
                      <div>
                        <div className="text-[9.5px] text-stone-400 font-bold">출근율</div>
                        <div className="text-xs font-black text-emerald-700 mt-0.5">
                          {staffItem.attendanceRate}%
                        </div>
                        <div className="text-[8.5px] text-stone-400">
                          {staffItem.attendanceDays}/{totalBusinessDays}일
                        </div>
                      </div>
                      <div>
                        <div className="text-[9.5px] text-stone-400 font-bold">초이스율</div>
                        <div className="text-xs font-black text-rose-600 mt-0.5">
                          {staffItem.totalAttempts > 0 ? `${staffItem.choiceRate}%` : "-"}
                        </div>
                        <div className="text-[8.5px] text-stone-400">
                          {staffItem.dispatchCount}/{staffItem.totalAttempts}회
                        </div>
                      </div>
                      <div>
                        <div className="text-[9.5px] text-stone-400 font-bold">연장율</div>
                        <div className="text-xs font-black text-indigo-700 mt-0.5">
                          {staffItem.dispatchCount > 0 ? `${staffItem.extensionRate}%` : "-"}
                        </div>
                        <div className="text-[8.5px] text-stone-400">
                          {staffItem.extendedCount}/{staffItem.dispatchCount}건
                        </div>
                      </div>
                    </div>

                    {/* Weekly Units Mini Pills */}
                    <div className="flex items-center justify-between text-[10px] text-stone-500 font-bold pt-1 border-t border-stone-100">
                      <span>주별 갯수:</span>
                      <div className="flex items-center gap-1">
                        {monthWeeks.map((w) => (
                          <span
                            key={w.weekNum}
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[9.5px]",
                              (staffItem.weeklyUnits[w.weekNum] || 0) > 0
                                ? "bg-indigo-50 text-indigo-700 font-black"
                                : "text-stone-300"
                            )}
                            title={`${w.weekNum}주차: ${staffItem.weeklyUnits[w.weekNum] || 0}개`}
                          >
                            {w.weekNum}주: {staffItem.weeklyUnits[w.weekNum] || 0}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 7. Staff Detail Modal */}
      {selectedStaffDetail && (
        <div
          className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          onClick={() => setSelectedStaffDetail(null)}
        >
          <div
            className="bg-white w-full max-w-2xl rounded-3xl p-5 sm:p-6 shadow-2xl border border-stone-100 my-auto max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-stone-100">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-black text-stone-900">
                    {selectedStaffDetail.name}
                  </h3>
                  {selectedStaffDetail.isDirect ? (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500 text-white shadow-2xs">
                      직속
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-purple-600 text-white shadow-2xs">
                      위탁 ({selectedStaffDetail.affiliation})
                    </span>
                  )}
                  <span className="text-xs text-stone-500 font-bold">
                    {selectedStaffDetail.category}
                  </span>
                </div>
                <p className="text-xs text-stone-400 mt-1">
                  {formattedMonthTitle} 월간 종합 활동 상세 내역
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedStaffDetail(null)}
                className="p-2 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="overflow-y-auto flex-1 py-4 space-y-5">
              {/* 4 Key Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-indigo-50/70 p-3 rounded-2xl border border-indigo-100 text-center">
                  <div className="text-[10px] text-indigo-700 font-bold">이번달 총 갯수</div>
                  <div className="text-xl font-black text-indigo-950 mt-0.5">
                    {selectedStaffDetail.monthlyTotalUnits}
                    <span className="text-xs font-bold text-indigo-700 ml-0.5">개</span>
                  </div>
                  <div className="text-[9.5px] text-stone-500 mt-0.5">
                    일평균 {selectedStaffDetail.avgUnitsPerDay}개
                  </div>
                </div>

                <div className="bg-emerald-50/70 p-3 rounded-2xl border border-emerald-100 text-center">
                  <div className="text-[10px] text-emerald-700 font-bold">출근율</div>
                  <div className="text-xl font-black text-emerald-950 mt-0.5">
                    {selectedStaffDetail.attendanceRate}%
                  </div>
                  <div className="text-[9.5px] text-stone-500 mt-0.5">
                    {selectedStaffDetail.attendanceDays}일 / {totalBusinessDays}영업일
                  </div>
                </div>

                <div className="bg-rose-50/70 p-3 rounded-2xl border border-rose-100 text-center">
                  <div className="text-[10px] text-rose-700 font-bold">초이스율</div>
                  <div className="text-xl font-black text-rose-950 mt-0.5">
                    {selectedStaffDetail.totalAttempts > 0 ? `${selectedStaffDetail.choiceRate}%` : "-"}
                  </div>
                  <div className="text-[9.5px] text-stone-500 mt-0.5">
                    진행 {selectedStaffDetail.dispatchCount} / 시도 {selectedStaffDetail.totalAttempts}회
                  </div>
                </div>

                <div className="bg-amber-50/70 p-3 rounded-2xl border border-amber-100 text-center">
                  <div className="text-[10px] text-amber-700 font-bold">연장율 (1.5h+)</div>
                  <div className="text-xl font-black text-amber-950 mt-0.5">
                    {selectedStaffDetail.dispatchCount > 0 ? `${selectedStaffDetail.extensionRate}%` : "-"}
                  </div>
                  <div className="text-[9.5px] text-stone-500 mt-0.5">
                    연장 {selectedStaffDetail.extendedCount} / 진행 {selectedStaffDetail.dispatchCount}건
                  </div>
                </div>
              </div>

              {/* Weekly Trend for this staff */}
              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200">
                <div className="text-xs font-black text-stone-700 mb-2 flex items-center justify-between">
                  <span>주차별 갯수 및 출근 현황</span>
                  <span className="text-[11px] font-normal text-stone-400">
                    기본 주 4일 기준
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {monthWeeks.map((w) => {
                    const wUnits = selectedStaffDetail.weeklyUnits[w.weekNum] || 0;
                    const wAtt = selectedStaffDetail.weeklyAttendance[w.weekNum] || 0;
                    return (
                      <div key={w.weekNum} className="bg-white p-2.5 rounded-xl border border-stone-200 text-center">
                        <div className="text-[10px] font-black text-stone-600">{w.weekNum}주차</div>
                        <div className="text-sm font-black text-indigo-900 mt-0.5">
                          {wUnits}개
                        </div>
                        <div className="text-[9.5px] text-emerald-700 font-bold mt-0.5">
                          출근 {wAtt}일
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Attendance Dates & Attached Daily Work History */}
              <div className="space-y-2.5">
                <div className="text-xs font-black text-stone-700 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                    <span>출근한 날짜 및 일별 근무 이력 ({selectedStaffDetail.attendanceDates.length}일)</span>
                  </div>
                  {selectedStaffDetail.attendanceDates.length > 0 && (
                    <span className="text-[10.5px] text-stone-400 font-normal">
                      날짜 클릭 시 해당 날짜로 메인 이동
                    </span>
                  )}
                </div>

                {/* Quick Date Filter Chips */}
                {selectedStaffDetail.attendanceDates.length > 1 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                    <button
                      type="button"
                      onClick={() => setSelectedAttDateFilter(null)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer",
                        selectedAttDateFilter === null
                          ? "bg-stone-900 text-white shadow-xs"
                          : "bg-stone-100 text-stone-600 hover:bg-stone-200",
                      )}
                    >
                      전체 ({selectedStaffDetail.attendanceDates.length}일)
                    </button>
                    {selectedStaffDetail.attendanceDates.map((d) => {
                      const isSelected = selectedAttDateFilter === d;
                      const dayRecs = selectedStaffDetail.records.filter((r) => r.date === d);
                      const dayUnits = dayRecs.reduce((sum, r) => sum + (r.durationHours || 0), 0);
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setSelectedAttDateFilter(isSelected ? null : d)}
                          className={cn(
                            "px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1 cursor-pointer",
                            isSelected
                              ? "bg-emerald-600 text-white shadow-xs"
                              : "bg-emerald-50 text-emerald-800 border border-emerald-200/80 hover:bg-emerald-100",
                          )}
                        >
                          <span>{d.slice(5)} ({format(parseISO(d), "EEE", { locale: ko })})</span>
                          <span className={cn("text-[10px]", isSelected ? "text-emerald-100" : "text-emerald-600")}>
                            {dayUnits}개
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Date-by-date Cards with Attached Work History */}
                {selectedStaffDetail.attendanceDates.length === 0 ? (
                  <div className="text-xs text-stone-400 bg-stone-50 border border-stone-200 p-4 rounded-2xl text-center">
                    출근 기록이 없습니다.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedStaffDetail.attendanceDates
                      .filter((d) => !selectedAttDateFilter || selectedAttDateFilter === d)
                      .map((d) => {
                        const dayRecords = selectedStaffDetail.records.filter((r) => r.date === d);
                        const dayBounced = selectedStaffDetail.bouncedRecords.filter((b) => b.date === d);
                        const dayTotalUnits = dayRecords.reduce((sum, r) => sum + (r.durationHours || 0), 0);
                        const dayExtCount = dayRecords.filter((r) => (r.durationHours || 0) >= 1.5).length;

                        return (
                          <div
                            key={d}
                            className="bg-stone-50/80 border border-stone-200/90 rounded-2xl p-3 sm:p-3.5 space-y-2.5 shadow-2xs hover:border-emerald-300/80 transition-all"
                          >
                            {/* Day Header Row */}
                            <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-stone-200/60">
                              <div className="flex items-center gap-2 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (onSelectDate) {
                                      onSelectDate(d);
                                      setSelectedStaffDetail(null);
                                    }
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-black hover:bg-emerald-200 active:scale-95 transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                                  title="클릭 시 메인 화면에서 이 날짜 열기"
                                >
                                  <Calendar className="w-3.5 h-3.5 text-emerald-700" />
                                  <span>{d.slice(5)} ({format(parseISO(d), "EEE", { locale: ko })})</span>
                                  <ChevronRight className="w-3 h-3 text-emerald-700" />
                                </button>

                                <span className="text-xs font-black text-stone-900">
                                  총 <strong className="text-indigo-950 font-black text-sm">{dayTotalUnits}</strong>개
                                </span>

                                {dayRecords.length > 0 && (
                                  <span className="text-[11px] text-stone-500 font-medium">
                                    (진행 {dayRecords.length}건{dayExtCount > 0 ? ` · 연장 ${dayExtCount}건` : ""})
                                  </span>
                                )}

                                {dayBounced.length > 0 && (
                                  <span className="text-[10.5px] font-bold text-rose-700 bg-rose-100/70 border border-rose-200 px-1.5 py-0.5 rounded">
                                    튕김 {dayBounced.length}건
                                  </span>
                                )}
                              </div>

                              {onSelectDate && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onSelectDate(d);
                                    setSelectedStaffDetail(null);
                                  }}
                                  className="text-[11px] text-stone-400 hover:text-stone-800 underline cursor-pointer"
                                >
                                  이 날짜로 이동
                                </button>
                              )}
                            </div>

                            {/* Attached Work Items for this Day */}
                            <div className="space-y-1.5">
                              {(() => {
                                const dayActivities = [
                                  ...dayRecords.map((r) => ({
                                    kind: "dispatch" as const,
                                    id: r.id,
                                    record: r,
                                    businessMinutes: getBusinessMinutes(r.startTime || r.createdAt),
                                    sTime: formatRecordTime(r.startTime),
                                    eTime: formatRecordTime(r.endTime),
                                  })),
                                  ...dayBounced.map((b) => ({
                                    kind: "bounced" as const,
                                    id: b.id,
                                    record: b,
                                    businessMinutes: getBusinessMinutes(b.time || b.createdAt),
                                    timeStr: b.time || "",
                                  })),
                                ].sort((a, b) => {
                                  const diff = a.businessMinutes - b.businessMinutes;
                                  if (diff !== 0) return diff;
                                  return (a.record.establishmentName || "").localeCompare(b.record.establishmentName || "", "ko");
                                });

                                if (dayActivities.length === 0) {
                                  return (
                                    <div className="text-[11px] text-stone-400 bg-white border border-stone-200/60 px-3 py-2 rounded-xl italic">
                                      출근 기록 외 진행된 방이나 초이스 튕김 내역이 없습니다.
                                    </div>
                                  );
                                }

                                return dayActivities.map((act, actIdx) => {
                                  if (act.kind === "dispatch") {
                                    const r = act.record as DispatchRecord;
                                    const isExt = (r.durationHours || 0) >= 1.5;
                                    const sTime = act.sTime;
                                    const eTime = act.eTime;
                                    return (
                                      <div
                                        key={r.id || `disp-${actIdx}`}
                                        className="flex items-center justify-between bg-white border border-stone-200/90 px-3 py-2 rounded-xl text-xs hover:border-stone-300 transition-colors shadow-2xs"
                                      >
                                        <div className="flex items-center gap-2 min-w-0">
                                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                          <span className="font-black text-stone-900 truncate">
                                            {r.establishmentName}
                                          </span>
                                          {(sTime || eTime) && (
                                            <span className="text-[10.5px] text-stone-400 font-medium whitespace-nowrap">
                                              {sTime && eTime ? `${sTime} ~ ${eTime}` : sTime || eTime}
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                          <span className="font-black text-indigo-950 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                                            {r.durationHours}개
                                          </span>
                                          {isExt && (
                                            <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-[10px] font-black">
                                              연장
                                            </span>
                                          )}
                                          <span className="text-stone-400 text-[10px] uppercase font-bold">
                                            {r.systemType}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  }

                                  const b = act.record as BouncedRecord;
                                  return (
                                    <div
                                      key={b.id || `bounce-${actIdx}`}
                                      className="flex items-center justify-between bg-rose-50/70 border border-rose-200/60 px-3 py-1.5 rounded-xl text-xs"
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0" />
                                        <span className="font-bold text-rose-900 truncate">
                                          {b.establishmentName}
                                        </span>
                                        {act.timeStr && (
                                          <span className="text-[10.5px] text-rose-500 font-medium">
                                            {act.timeStr}
                                          </span>
                                        )}
                                      </div>
                                      <span className="bg-rose-200/80 text-rose-800 px-1.5 py-0.5 rounded text-[10px] font-black shrink-0">
                                        초이스 튕김
                                      </span>
                                    </div>
                                  );
                                });
                              })()}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* Choice Bounced History */}
              {selectedStaffDetail.bouncedRecords.length > 0 && (
                <div>
                  <div className="text-xs font-black text-rose-700 mb-2 flex items-center justify-between">
                    <span>초이스 튕김 내역 ({selectedStaffDetail.bouncedRecords.length}건)</span>
                  </div>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {selectedStaffDetail.bouncedRecords.map((b, idx) => (
                      <div
                        key={b.id || idx}
                        className="flex items-center justify-between bg-rose-50/60 border border-rose-100 p-2 rounded-xl text-xs"
                      >
                        <span className="font-bold text-rose-900">{b.establishmentName}</span>
                        <div className="text-stone-500 text-[11px] flex items-center gap-2">
                          <span>{b.date}</span>
                          <span>{b.time}</span>
                          <span className="bg-rose-200 text-rose-800 px-1.5 py-0.2 rounded text-[10px] font-bold">튕김</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Dispatches List */}
              <div>
                <div className="text-xs font-black text-stone-700 mb-2 flex items-center justify-between">
                  <span>파견(방) 진행 내역 ({selectedStaffDetail.records.length}건)</span>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {selectedStaffDetail.records.length === 0 ? (
                    <span className="text-xs text-stone-400">파견 기록이 없습니다.</span>
                  ) : (
                    selectedStaffDetail.records.map((r, idx) => {
                      const isExt = (r.durationHours || 0) >= 1.5;
                      return (
                        <div
                          key={r.id || idx}
                          className="flex items-center justify-between bg-stone-50 border border-stone-200 p-2.5 rounded-xl text-xs"
                        >
                          <div>
                            <span className="font-black text-stone-900">{r.establishmentName}</span>
                            <span className="text-stone-400 text-[10px] ml-2">{r.date}</span>
                            {formatRecordTime(r.startTime) && (
                              <span className="text-stone-500 text-[10.5px] ml-2 font-medium">
                                {formatRecordTime(r.startTime)}
                                {formatRecordTime(r.endTime) ? ` ~ ${formatRecordTime(r.endTime)}` : ""}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-indigo-900">
                              {r.durationHours}개
                            </span>
                            {isExt && (
                              <span className="bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded text-[10px] font-bold">
                                연장
                              </span>
                            )}
                            <span className="text-stone-400 text-[10px]">
                              {r.systemType}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-stone-100 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedStaffDetail(null)}
                className="px-5 py-2 rounded-xl bg-stone-900 text-white font-bold text-xs hover:bg-stone-800 transition-all cursor-pointer"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
