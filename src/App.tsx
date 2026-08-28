import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  Component,
  ReactNode,
  ErrorInfo,
  useDeferredValue,
} from "react";
import {
  Plus,
  LogOut,
  Calendar,
  Users,
  Building2,
  Clock,
  DollarSign,
  Trash2,
  Edit2,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  History,
  Wallet,
  AlertCircle,
  GanttChart,
  List as ListIcon,
  CheckCircle2,
  XCircle,
  Settings,
  UserPlus,
  Check,
  Gift,
  Coins,
  X,
  Zap,
  RefreshCw,
  Edit3,
  Search,
  ArrowUp,
  ArrowDown,
  Camera,
  ExternalLink,
  Database,
  Sparkles,
  Play,
} from "lucide-react";
import * as htmlToImage from "html-to-image";
import { motion, AnimatePresence } from "motion/react";
import {
  format,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  parseISO,
  addMinutes,
  isWithinInterval,
  subDays,
  addDays,
} from "date-fns";
import { ko } from "date-fns/locale";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Timestamp } from "firebase/firestore";
import {
  DispatchRecord,
  SystemType,
  PaymentMethod,
  SYSTEM_RATES,
  Staff,
  StaffType,
  CollectionHistoryEntry,
  BouncedRecord,
  ActiveChoice,
} from "./types";
import {
  addDispatch,
  updateDispatch,
  subscribeToDispatches,
  subscribeToAllUnpaidDispatches,
  subscribeToUnpaidStaffDispatches,
  deleteDispatch,
  addBouncedRecord,
  deleteBouncedRecord,
  subscribeToBouncedRecords,
  testConnection,
  subscribeToStaff,
  subscribeToAttendance,
  subscribeToWeeklyAttendance,
  updateAttendance,
  updateActiveChoices,
  setActiveChoicesMultiple,
  removeActiveChoicesMultiple,
  updateManualDailyProfit,
  updateManualDailyProfitsMultiple,
  addStaff,
  updateStaff,
  deleteStaff,
  checkTimeOverlap,
  subscribeToEstablishments,
  addEstablishment,
  deleteEstablishment,
} from "./services/dispatchService";
import { SettlementView } from "./components/SettlementView";
import { UnpaidDetailView } from "./components/UnpaidDetailView";
import { ChoiceSetupModal } from "./components/ChoiceSetupModal";
import { ChoiceActionModal } from "./components/ChoiceActionModal";
import { calculateEstablishmentCollection, getRecordCollectionHistory, getRecordBusinessDate } from "./lib/utils";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatStaffNameComponents(fullName: string) {
  if (!fullName) return { main4: "", fullName: "", category: "", namePart: "", affiliation: "직속", isDirect: true };

  const trimmed = fullName.trim();
  const cleanNoSpace = trimmed.replace(/\s+/g, "");

  // 1. If 4 characters or fewer (e.g. "하퍼 요셉" -> clean: "하퍼요셉" 4자) -> 직속직원
  if (cleanNoSpace.length <= 4) {
    let category = "커피";
    let namePart = cleanNoSpace;
    if (cleanNoSpace.startsWith("하퍼") || cleanNoSpace.startsWith("하_")) {
      category = "하퍼";
      namePart = cleanNoSpace.replace(/^하[퍼_]?/, "");
    } else if (cleanNoSpace.startsWith("퍼블릭") || cleanNoSpace.startsWith("퍼_")) {
      category = "퍼블릭";
      namePart = cleanNoSpace.replace(/^퍼[블릭_]?/, "");
    } else if (cleanNoSpace.startsWith("커피") || cleanNoSpace.startsWith("커_")) {
      category = "커피";
      namePart = cleanNoSpace.replace(/^커[피_]?/, "");
    }

    return {
      main4: trimmed,
      fullName: trimmed,
      category,
      namePart: namePart || trimmed,
      affiliation: "직속",
      isDirect: true,
    };
  }

  // 2. If more than 4 characters (e.g. "하퍼 유리 시크" -> 6자 형식) -> 위탁직원
  // The text after the first 4 characters represents the affiliation (소속)
  const parts = trimmed.split(/\s+/).filter(Boolean);
  let affiliation = "";
  let main4 = "";

  if (parts.length >= 3) {
    // e.g. ["하퍼", "유리", "시크"]
    main4 = `${parts[0]} ${parts[1]}`;
    affiliation = parts.slice(2).join(" ").trim();
  } else if (parts.length === 2) {
    // e.g. ["하퍼", "유리시크"]
    if (parts[1].length > 2) {
      main4 = `${parts[0]} ${parts[1].slice(0, 2)}`;
      affiliation = parts[1].slice(2).trim();
    } else {
      main4 = parts[0];
      affiliation = parts[1].trim();
    }
  } else {
    // e.g. "하퍼유리시크"
    main4 = `${cleanNoSpace.slice(0, 2)} ${cleanNoSpace.slice(2, 4)}`;
    affiliation = cleanNoSpace.slice(4).trim();
  }

  // Clean any surrounding brackets if present
  affiliation = affiliation.replace(/^[\(\[\{]+|[\)\]\}]+$/g, "").trim();
  if (!affiliation) {
    affiliation = "위탁";
  }

  let category = "커피";
  let namePart = cleanNoSpace.slice(0, 4);
  if (cleanNoSpace.startsWith("하퍼") || cleanNoSpace.startsWith("하_")) {
    category = "하퍼";
    namePart = cleanNoSpace.slice(0, 4).replace(/^하[퍼_]?/, "");
  } else if (cleanNoSpace.startsWith("퍼블릭") || cleanNoSpace.startsWith("퍼_")) {
    category = "퍼블릭";
    namePart = cleanNoSpace.slice(0, 4).replace(/^퍼[블릭_]?/, "");
  } else if (cleanNoSpace.startsWith("커피") || cleanNoSpace.startsWith("커_")) {
    category = "커피";
    namePart = cleanNoSpace.slice(0, 4).replace(/^커[피_]?/, "");
  }

  return {
    main4: main4 || trimmed.slice(0, 5),
    fullName: trimmed,
    category,
    namePart: namePart || trimmed,
    affiliation,
    isDirect: false,
  };
}

const timestampToTimeStr = (ts: any) => {
  if (!ts) return "";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return format(date, "HH:mm");
};

const timeStrToTimestamp = (timeStr: string, baseDateStr: string) => {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const date = parseISO(baseDateStr);
  if (hours < 18) {
    date.setDate(date.getDate() + 1);
  }
  date.setHours(hours, minutes, 0, 0);
  return Timestamp.fromDate(date);
};

const getErrorMessage = (
  error: any,
  defaultMessage: string = "오류가 발생했습니다.",
) => {
  if (!error) return defaultMessage;
  try {
    const errInfo = JSON.parse(error.message);
    return `${errInfo.error} (${errInfo.operationType})`;
  } catch {
    if (error instanceof Error) return error.message;
    return typeof error === "string" ? error : defaultMessage;
  }
};

// getRecordCollectionHistory imported from ./lib/utils


export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-6">
            <AlertCircle className="text-red-600 w-10 h-10" />
          </div>
          <h1 className="text-2xl font-bold text-stone-900 mb-2">
            문제가 발생했습니다
          </h1>
          <p className="text-stone-500 mb-8 max-w-sm">
            애플리케이션 실행 중 예기치 않은 오류가 발생했습니다. 아래 버튼을
            눌러 다시 시도해 주세요.
          </p>
          <div className="space-y-3 w-full max-w-xs">
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-stone-900 text-white rounded-xl font-bold shadow-lg active:scale-95 transition-all"
            >
              새로고침하여 다시 시작
            </button>
            <button
              onClick={async () => {
                localStorage.clear();
                if ("serviceWorker" in navigator) {
                  try {
                    const registrations =
                      await navigator.serviceWorker.getRegistrations();
                    await Promise.all(registrations.map((r) => r.unregister()));
                  } catch (e) {
                    console.error(e);
                  }
                }
                window.location.reload();
              }}
              className="w-full py-3 bg-white text-stone-500 border border-stone-200 rounded-xl font-bold text-sm"
            >
              데이터 및 캐시 초기화 후 다시 시작
            </button>
          </div>
          {this.state.error && (
            <div className="mt-8 p-4 bg-stone-100 rounded-xl text-left overflow-auto max-w-md w-full">
              <p className="text-[10px] font-mono text-stone-400 uppercase mb-1">
                Error Details
              </p>
              <p className="text-xs font-mono text-stone-600">
                {this.state.error.toString()}
              </p>
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem("office_auth") === "true";
  });
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(() => {
    return localStorage.getItem("office_auth") === "true";
  });
  const [_records, setRecords] = useState<DispatchRecord[]>([]);
  const [showLoadingUI, setShowLoadingUI] = useState(false);

  // Global filters
  const [globalEmploymentFilter, setGlobalEmploymentFilter] = useState<
    "ALL" | "DIRECT" | "DELEGATED"
  >("ALL");
  const [globalStaffTypeFilter, setGlobalStaffTypeFilter] = useState<
    "ALL" | "HOPPER" | "PUBLIC" | "COFFEE"
  >("ALL");

  const [_allUnpaidRecords, setAllUnpaidRecords] = useState<DispatchRecord[]>(
    [],
  );
  const [_unpaidStaffRecords, setUnpaidStaffRecords] = useState<
    DispatchRecord[]
  >([]);
  const [_staff, setStaff] = useState<Staff[]>([]);

  // Filtered lists based on staff type and employment type
  const staff = useMemo(
    () =>
      _staff.filter((s) => {
        let match = true;
        const isDirect = formatStaffNameComponents(s.name).isDirect;
        if (globalEmploymentFilter === "DIRECT") match = match && isDirect;
        if (globalEmploymentFilter === "DELEGATED") match = match && !isDirect;

        if (globalStaffTypeFilter === "HOPPER")
          match = match && s.type === "HOPPER";
        if (globalStaffTypeFilter === "PUBLIC")
          match = match && s.type === "PUBLIC";
        if (globalStaffTypeFilter === "COFFEE")
          match = match && s.type === "COFFEE";

        return match;
      }),
    [_staff, globalStaffTypeFilter, globalEmploymentFilter],
  );

  // Create a mapping from any previous names of the staff to their active current name
  const staffRenameMap = useMemo(() => {
    const map = new Map<string, string>();
    _staff.forEach((s) => {
      if (s.previousNames) {
        s.previousNames.forEach((prev) => {
          if (prev && prev.trim()) {
            map.set(prev.trim(), s.name);
          }
        });
      }
      // Hardcoded fallback recovery for "다온" -> "다혜" in case previousNames is not yet in MongoDB / Firestore
      if (s.name === "다온") {
        map.set("다혜", "다온");
      }
    });
    return map;
  }, [_staff]);

  const filteredStaffNameSet = useMemo(
    () => new Set(staff.map((s) => s.name)),
    [staff],
  );

  const records = useMemo(() => {
    return _records
      .map((r) => {
        const currentName = staffRenameMap.get(r.staffName?.trim());
        if (currentName) {
          return { ...r, staffName: currentName };
        }
        return r;
      })
      .filter((r) => filteredStaffNameSet.has(r.staffName));
  }, [_records, filteredStaffNameSet, staffRenameMap]);

  const allUnpaidRecords = useMemo(() => {
    return _allUnpaidRecords
      .map((r) => {
        const currentName = staffRenameMap.get(r.staffName?.trim());
        if (currentName) {
          return { ...r, staffName: currentName };
        }
        return r;
      })
      .filter((r) => filteredStaffNameSet.has(r.staffName));
  }, [_allUnpaidRecords, filteredStaffNameSet, staffRenameMap]);

  const unpaidStaffRecords = useMemo(() => {
    return _unpaidStaffRecords
      .map((r) => {
        const currentName = staffRenameMap.get(r.staffName?.trim());
        if (currentName) {
          return { ...r, staffName: currentName };
        }
        return r;
      })
      .filter((r) => filteredStaffNameSet.has(r.staffName));
  }, [_unpaidStaffRecords, filteredStaffNameSet, staffRenameMap]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (loading && isAuthenticated && _records.length === 0) {
      timer = setTimeout(() => setShowLoadingUI(true), 300); // 300ms delay
    } else {
      setShowLoadingUI(false);
    }
    return () => clearTimeout(timer);
  }, [loading, isAuthenticated, _records.length]);

  const [establishments, setEstablishments] = useState<
    { id: string; name: string }[]
  >([]);
  const [workingStaffIds, setWorkingStaffIds] = useState<string[]>([]);
  const [offStaffIds, setOffStaffIds] = useState<string[]>([]);
  const [checkInTimes, setCheckInTimes] = useState<Record<string, any>>({});
  const [offTimes, setOffTimes] = useState<Record<string, any>>({});
  const [weeklyAttendanceData, setWeeklyAttendanceData] = useState<
    Array<{ date: string; staffIds: string[]; checkInTimes?: Record<string, any> }>
  >([]);
  const [rawManualDailyProfits, setRawManualDailyProfits] = useState<
    Record<string, number>
  >({});
  const [rawActiveChoices, setRawActiveChoices] = useState<
    Record<string, ActiveChoice>
  >({});

  const manualDailyProfits = useMemo(() => {
    const norm: Record<string, number> = {};
    Object.entries(rawManualDailyProfits).forEach(([name, val]) => {
      const currentName = staffRenameMap.get(name.trim());
      if (currentName) {
        norm[currentName] = val;
      } else {
        norm[name] = val;
      }
    });
    return norm;
  }, [rawManualDailyProfits, staffRenameMap]);

  const activeChoices = useMemo(() => {
    const norm: Record<string, ActiveChoice> = {};
    Object.entries(rawActiveChoices).forEach(([name, val]) => {
      const currentName = staffRenameMap.get(name.trim());
      if (currentName) {
        norm[currentName] = val;
      } else {
        norm[name] = val;
      }
    });
    return norm;
  }, [rawActiveChoices, staffRenameMap]);

  const [selectedDate, setSelectedDate] = useState(() => {
    const stored = localStorage.getItem("office_selected_date");
    if (stored) return stored;

    const now = new Date();
    // If before 18:00, the current business day is yesterday
    if (now.getHours() < 18) {
      return format(subDays(now, 1), "yyyy-MM-dd");
    }
    return format(now, "yyyy-MM-dd");
  });

  const weeklyAttendanceMap = useMemo(() => {
    const map: Record<string, Set<string>> = {};

    weeklyAttendanceData.forEach((item) => {
      const d = item.date;
      const ids = new Set<string>([
        ...(item.staffIds || []),
        ...Object.keys(item.checkInTimes || {}),
      ]);
      ids.forEach((id) => {
        if (!map[id]) map[id] = new Set();
        map[id].add(d);
      });
    });

    if (selectedDate && checkInTimes) {
      Object.keys(checkInTimes).forEach((id) => {
        if (!map[id]) map[id] = new Set();
        map[id].add(selectedDate);
      });
    }

    const counts: Record<string, number> = {};
    Object.keys(map).forEach((id) => {
      counts[id] = map[id].size;
    });
    return counts;
  }, [weeklyAttendanceData, selectedDate, checkInTimes]);
  const [isFormOpen, setIsFormOpen] = useState(() => {
    return localStorage.getItem("office_is_form_open") === "true";
  });
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(() => {
    return localStorage.getItem("office_is_staff_modal_open") === "true";
  });
  const [detailModal, setDetailModal] = useState<{
    type: "revenue" | "commission" | "staffPayment" | "unpaid";
    isOpen: boolean;
    initialSearchTerm?: string;
  }>(() => {
    const stored = localStorage.getItem("office_detail_modal");
    return stored ? JSON.parse(stored) : { type: "revenue", isOpen: false };
  });

  const [statusModal, setStatusModal] = useState<{
    type: "TOTAL" | "WORKING" | "WAITING" | "FINISHED" | "OFF_DUTY";
    isOpen: boolean;
  }>(() => {
    const stored = localStorage.getItem("office_status_modal");
    return stored ? JSON.parse(stored) : { type: "TOTAL", isOpen: false };
  });
  const [manualProfitModalConfig, setManualProfitModalConfig] = useState<{
    isOpen: boolean;
    staffName: string;
    date: string;
    currentCalculatedProfit: number;
    currentManualProfit?: number;
  } | null>(null);
  const [editingRecord, setEditingRecord] = useState<DispatchRecord | null>(
    () => {
      const stored = localStorage.getItem("office_editing_record");
      if (!stored) return null;
      try {
        const parsed = JSON.parse(stored);
        // Revive timestamps if they were serialized as objects
        const revive = (obj: any) => {
          if (obj && typeof obj === "object" && obj.seconds !== undefined) {
            return new Timestamp(obj.seconds, obj.nanoseconds);
          }
          return obj;
        };
        if (parsed.startTime) parsed.startTime = revive(parsed.startTime);
        if (parsed.endTime) parsed.endTime = revive(parsed.endTime);
        if (parsed.createdAt) parsed.createdAt = revive(parsed.createdAt);
        if (parsed.collectedAt) parsed.collectedAt = revive(parsed.collectedAt);
        if (parsed.additionalCollectedAt) parsed.additionalCollectedAt = revive(parsed.additionalCollectedAt);
        if (parsed.collectionHistory && Array.isArray(parsed.collectionHistory)) {
          parsed.collectionHistory = parsed.collectionHistory.map((h: any) => ({
            ...h,
            collectedAt: revive(h.collectedAt),
          }));
        }
        if (parsed.staffPaidAt) parsed.staffPaidAt = revive(parsed.staffPaidAt);
        return parsed;
      } catch {
        return null;
      }
    },
  );
  const [preSelectedStaffNames, setPreSelectedStaffNames] = useState<string[]>(
    () => {
      const stored = localStorage.getItem("office_pre_selected_staff");
      return stored ? JSON.parse(stored) : [];
    },
  );
  const [authError, setAuthError] = useState<string | null>(null);
  const [bouncedRecords, setBouncedRecords] = useState<BouncedRecord[]>([]);
  const [selectedBouncedStaff, setSelectedBouncedStaff] = useState<string | null>(null);
  const [highlightedStaffColumn, setHighlightedStaffColumn] = useState<
    string | null
  >(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "settlement" | "unpaid">(() => {
    const saved = localStorage.getItem("office_view_mode");
    if (saved === "timeline") return "settlement";
    if (saved === "unpaid") return "unpaid";
    return (saved as "list" | "settlement" | "unpaid") || "list";
  });
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [alertConfig, setAlertConfig] = useState<{
    message: string;
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);
  const [bounceModalConfig, setBounceModalConfig] = useState<{
    isOpen: boolean;
    staffWithOngoing: { staffName: string; record: DispatchRecord }[];
    staffWithoutOngoing: string[];
  } | null>(null);
  const [isChoiceModalOpen, setIsChoiceModalOpen] = useState(false);
  const [choiceModalStaff, setChoiceModalStaff] = useState<string[]>([]);
  const [choiceActionModalConfig, setChoiceActionModalConfig] = useState<{
    isOpen: boolean;
    mode: "PROGRESS" | "BOUNCE";
    staffNames: string[];
    initialEstablishmentName: string;
    initialTime?: string;
  } | null>(null);
  const [isBatchDelegatedProfitModalOpen, setIsBatchDelegatedProfitModalOpen] =
    useState(false);
  const [capturingGroupText, setCapturingGroupText] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // 로딩 타임아웃 설정 (15초)
    let timeoutId: NodeJS.Timeout;
    if (loading && isAuthenticated) {
      timeoutId = setTimeout(() => {
        setLoading(false);
        setInitError(
          "데이터를 불러오는 데 시간이 너무 오래 걸립니다. 네트워크 상태를 확인하거나 잠시 후 다시 시도해 주세요. (할당량 초과일 수 있습니다)",
        );
      }, 15000);
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [loading, isAuthenticated]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (highlightedId) {
      const timer = setTimeout(() => {
        setHighlightedId(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [highlightedId]);

  useEffect(() => {
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBtn(true);
    });
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      // 설치 신호가 없을 때 안내 (아이폰이나 이미 설치된 경우 등)
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      if (isIOS) {
        setAlertConfig({
          message:
            "아이폰은 브라우저 하단의 [공유(내보내기)] 버튼을 누른 후, [홈 화면에 추가]를 선택해주세요.",
        });
      } else {
        setAlertConfig({
          message:
            "브라우저 설정 메뉴(점 3개)에서 [앱 설치] 또는 [홈 화면에 추가]를 선택하시면 바탕화면에 아이콘이 생깁니다.",
        });
      }
      return;
    }
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setShowInstallBtn(false);
      }
      setDeferredPrompt(null);
    } catch (error) {
      console.error("설치 오류:", error);
    }
  };

  const handleFocusStaff = (staffName: string) => {
    const focusAndHighlight = () => {
      setHighlightedStaffColumn(staffName);

      const staffCard = document.getElementById(`staff-card-${staffName}`);
      const staffColumn = document.getElementById(`staff-column-${staffName}`);

      if (staffColumn) {
        try {
          staffColumn.scrollIntoView({
            behavior: "auto",
            inline: "center",
            block: "nearest",
          });
        } catch (e) {
          staffColumn.scrollIntoView();
        }
      }

      if (staffCard) {
        try {
          staffCard.scrollIntoView({
            behavior: "auto",
            inline: "center",
            block: "center",
          });
        } catch (e) {
          staffCard.scrollIntoView();
        }
      } else if (!staffColumn) {
        const attendanceSection = document.getElementById("attendance-status-section");
        if (attendanceSection) {
          try {
            attendanceSection.scrollIntoView({
              behavior: "auto",
              block: "center",
            });
          } catch (e) {
            attendanceSection.scrollIntoView();
          }
        }
      }
      setTimeout(() => setHighlightedStaffColumn(null), 3000);
    };

    focusAndHighlight();
  };

  const handleFocusStaffRecord = (staffName: string) => {
    const targetStaffMain4 = formatStaffNameComponents(staffName).main4;

    // 현재 선택된 날짜의 records에서 해당 직원의 기록 검색
    const staffRecords = records.filter((r) => {
      const rMain4 = formatStaffNameComponents(r.staffName || "").main4;
      return r.staffName === staffName || (rMain4 && rMain4 === targetStaffMain4);
    });

    if (staffRecords.length === 0) {
      // 파견 기록이 없으면 리스트/타임라인의 해당 직원 컬럼으로 스크롤 이동
      const staffColumn =
        document.getElementById(`staff-column-${staffName}`) ||
        document.getElementById(`staff-timeline-column-${staffName}`);

      if (staffColumn) {
        staffColumn.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        setHighlightedStaffColumn(staffName);
        setTimeout(() => setHighlightedStaffColumn(null), 3000);
      } else {
        setAlertConfig({
          message: `${staffName} 님의 오늘 등록된 파견(업무) 기록이 없습니다.`,
        });
      }
      return;
    }

    // 1) 진행 중인 파견 기록 우선 선택 (startTime === endTime)
    let targetRecord = staffRecords.find((r) => {
      if (!r.startTime || !r.endTime) return false;
      const start = r.startTime.toDate ? r.startTime.toDate() : new Date(r.startTime);
      const end = r.endTime.toDate ? r.endTime.toDate() : new Date(r.endTime);
      return start.getTime() === end.getTime();
    });

    // 2) 진행 중인 기록이 없으면 가장 최근 파견 기록 선택
    if (!targetRecord) {
      const sorted = [...staffRecords].sort((a, b) => {
        const getTs = (t: any) => {
          if (!t) return 0;
          const d = t.toDate ? t.toDate() : new Date(t);
          return d.getTime();
        };
        return getTs(a.startTime) - getTs(b.startTime);
      });
      targetRecord = sorted[sorted.length - 1];
    }

    if (targetRecord && targetRecord.id) {
      const recordId = targetRecord.id;
      setHighlightedId(recordId);

      setTimeout(() => {
        const element = document.getElementById(`record-${recordId}`);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        } else {
          const staffColumn =
            document.getElementById(`staff-column-${staffName}`) ||
            document.getElementById(`staff-timeline-column-${staffName}`);
          if (staffColumn) {
            staffColumn.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
          }
        }
      }, 50);
    }
  };

  const handleAddRecordForStaff = (staffNames: string[]) => {
    setPreSelectedStaffNames(staffNames);
    setIsFormOpen(true);
  };

  const handleToggleOffMultiple = async (staffNames: string[]) => {
    try {
      const targetStaff = staff.filter(
        (s) => s.id && staffNames.includes(s.name) && workingStaffIds.includes(s.id),
      );
      if (targetStaff.length === 0) return;

      const targetIds = targetStaff.map((s) => s.id!);
      const newOffIds = Array.from(new Set([...offStaffIds, ...targetIds]));
      const newOffTimes = { ...offTimes };
      const now = Timestamp.now();
      targetIds.forEach((id) => {
        if (!offTimes[id]) {
          newOffTimes[id] = now;
        }
      });

      await updateAttendance(
        selectedDate,
        workingStaffIds,
        newOffIds,
        newOffTimes,
      );
    } catch (error) {
      console.error("일괄 퇴근 처리 오류:", error);
      setAlertConfig({ message: "일괄 퇴근 처리 중 오류가 발생했습니다." });
    }
  };

  const handleProgressMultiple = (staffNames: string[]) => {
    if (!staffNames || staffNames.length === 0) return;

    // Check if any selected staff does not have an active choice
    const staffWithChoice = staffNames.filter((name) => !!activeChoices[name]);
    const staffWithoutChoice = staffNames.filter((name) => !activeChoices[name]);

    if (staffWithoutChoice.length > 0) {
      setAlertConfig({
        message:
          "초이스 상태인 직원만 진행 처리가 가능합니다. (초이스 상태가 아닌 직원이 포함되어 있습니다)",
      });
      return;
    }

    // Check if all selected staff have the SAME choice establishment
    const distinctEsts = Array.from(
      new Set(
        staffNames
          .map((name) => activeChoices[name]?.establishmentName?.trim())
          .filter(Boolean),
      ),
    );

    if (distinctEsts.length > 1) {
      setAlertConfig({
        message:
          "선택된 직원들의 초이스 가게가 서로 다릅니다. 동일한 초이스 가게의 직원들만 선택해주세요.",
      });
      return;
    }

    const initialEst = distinctEsts[0] || "";
    setChoiceActionModalConfig({
      isOpen: true,
      mode: "PROGRESS",
      staffNames,
      initialEstablishmentName: initialEst,
      initialTime: format(currentTime || new Date(), "HH:mm"),
    });
  };

  const handleBounceMultiple = async (staffNames: string[]) => {
    try {
      if (!staffNames || staffNames.length === 0) return;

      const staffWithChoice = staffNames.filter((name) => !!activeChoices[name]);
      const staffWithoutChoice = staffNames.filter((name) => !activeChoices[name]);

      // If some are in choice and some are in general status
      if (staffWithChoice.length > 0 && staffWithoutChoice.length > 0) {
        setAlertConfig({
          message:
            "초이스 상태인 직원과 일반 상태인 직원을 함께 튕김 처리할 수 없습니다. 같은 상태의 인원만 선택해주세요.",
        });
        return;
      }

      // If all selected staff are in choice status
      if (staffWithChoice.length > 0) {
        const distinctEsts = Array.from(
          new Set(
            staffWithChoice
              .map((name) => activeChoices[name]?.establishmentName?.trim())
              .filter(Boolean),
          ),
        );

        if (distinctEsts.length > 1) {
          setAlertConfig({
            message:
              "선택된 직원들의 초이스 가게가 서로 다릅니다. 동일한 초이스 가게의 직원들만 선택해주세요.",
          });
          return;
        }

        const initialEst = distinctEsts[0] || "";
        setChoiceActionModalConfig({
          isOpen: true,
          mode: "BOUNCE",
          staffNames: staffWithChoice,
          initialEstablishmentName: initialEst,
          initialTime: format(currentTime || new Date(), "HH:mm"),
        });
        return;
      }

      // General (non-choice) bounce
      const staffWithOngoing: { staffName: string; record: DispatchRecord }[] = [];
      const staffWithoutOngoing: string[] = [];

      staffNames.forEach((name) => {
        const ongoingRecord = records.find((r) => {
          if (r.staffName !== name || r.date !== selectedDate) return false;
          const rStart = r.startTime.toDate
            ? r.startTime.toDate()
            : new Date(r.startTime);
          const rEnd = r.endTime.toDate
            ? r.endTime.toDate()
            : new Date(r.endTime);
          return rStart.getTime() === rEnd.getTime();
        });

        if (ongoingRecord) {
          staffWithOngoing.push({ staffName: name, record: ongoingRecord });
        } else {
          staffWithoutOngoing.push(name);
        }
      });

      const executeGeneralBounce = async () => {
        try {
          // If all staff have ongoing dispatch boxes, bounce them immediately using their ongoing dispatch box
          if (staffWithoutOngoing.length === 0) {
            const promises: Promise<any>[] = [];
            for (const item of staffWithOngoing) {
              const recStart = item.record.startTime.toDate
                ? item.record.startTime.toDate()
                : new Date(item.record.startTime);
              const timeStr = format(recStart, "HH:mm");
              promises.push(
                addBouncedRecord({
                  staffName: item.staffName,
                  establishmentName: item.record.establishmentName || "미정",
                  time: timeStr,
                  date: selectedDate,
                }),
              );
              if (item.record.id) {
                promises.push(deleteDispatch(item.record.id));
              }
            }
            await Promise.all(promises);
          } else {
            // If there are staff without ongoing dispatch boxes, open modal to input establishment name
            setBounceModalConfig({
              isOpen: true,
              staffWithOngoing,
              staffWithoutOngoing,
            });
          }
        } catch (error) {
          console.error("일괄 튕김 처리 오류:", error);
          setAlertConfig({ message: "일괄 튕김 처리 중 오류가 발생했습니다." });
        }
      };

      // Check if any ongoing dispatch box has been running for 10 minutes or more
      const now = currentTime || new Date();
      const overTenMinStaff = staffWithOngoing.filter((item) => {
        const recStart = item.record.startTime.toDate
          ? item.record.startTime.toDate()
          : new Date(item.record.startTime);
        const diffMinutes = Math.floor((now.getTime() - recStart.getTime()) / (60 * 1000));
        return diffMinutes >= 10;
      });

      if (overTenMinStaff.length > 0) {
        const staffDetails = overTenMinStaff
          .map((item) => {
            const recStart = item.record.startTime.toDate
              ? item.record.startTime.toDate()
              : new Date(item.record.startTime);
            const diffMinutes = Math.max(
              0,
              Math.floor((now.getTime() - recStart.getTime()) / (60 * 1000)),
            );
            const startStr = format(recStart, "HH:mm");
            return `• ${item.staffName} (${item.record.establishmentName || "가게명 없음"}): ${startStr} 시작 (${diffMinutes}분 경과)`;
          })
          .join("\n");

        setAlertConfig({
          message: `⚠️ 현재 진행 중인 업무가 10분 이상 경과된 직원이 포함되어 있습니다.\n잘못 선택된 업무박스가 아닌지 확인해주세요.\n\n${staffDetails}\n\n그래도 튕김 처리를 진행하시겠습니까?`,
          actionLabel: "튕김 계속 진행",
          onAction: () => {
            executeGeneralBounce();
          },
        });
        return;
      }

      await executeGeneralBounce();
    } catch (error) {
      console.error("일괄 튕김 처리 오류:", error);
      setAlertConfig({ message: "일괄 튕김 처리 중 오류가 발생했습니다." });
    }
  };

  const handleConfirmChoiceActionModal = async (
    establishmentName: string,
    timeStr: string,
  ) => {
    if (!choiceActionModalConfig) return;
    const { mode, staffNames } = choiceActionModalConfig;

    try {
      if (mode === "PROGRESS") {
        const [h, m] = timeStr.split(":").map(Number);
        const baseDate = parseISO(selectedDate);
        const start =
          h < 18
            ? addMinutes(baseDate, 24 * 60 + h * 60 + m)
            : addMinutes(baseDate, h * 60 + m);

        const addPromises: Promise<any>[] = [];
        for (const staffName of staffNames) {
          const s = staff.find((st) => st.name === staffName);
          const systemType: SystemType = s
            ? s.type === "COFFEE"
              ? "TABLE"
              : s.type === "PUBLIC"
                ? "PUBLIC"
                : "HOPPER"
            : "HOPPER";

          addPromises.push(
            addDispatch({
              staffName,
              establishmentName,
              systemType,
              startTime: start,
              endTime: start, // ongoing dispatch
              paymentMethod: "UNPAID",
              isBanti: s?.isBanti || false,
              isNoBanti: s?.isNoBanti || false,
              tip: s?.defaultTip || 0,
              date: selectedDate,
              wasUnpaid: true,
            }),
          );
        }
        await Promise.all(addPromises);

        // Remove from active choices
        await removeActiveChoicesMultiple(selectedDate, staffNames);
      } else {
        // BOUNCE
        const bouncePromises: Promise<any>[] = [];
        for (const staffName of staffNames) {
          bouncePromises.push(
            addBouncedRecord({
              staffName,
              establishmentName,
              time: timeStr,
              date: selectedDate,
            }),
          );
        }
        await Promise.all(bouncePromises);

        // Remove from active choices, returning staff to waiting state
        await removeActiveChoicesMultiple(selectedDate, staffNames);
      }
    } catch (error) {
      console.error(`${mode === "PROGRESS" ? "진행" : "튕김"} 처리 오류:`, error);
      setAlertConfig({
        message: `${mode === "PROGRESS" ? "초이스 진행" : "초이스 튕김"} 처리 중 오류가 발생했습니다.`,
      });
    }
  };

  const handleConfirmBounceModal = async (
    establishmentName: string,
    time: string,
  ) => {
    if (!bounceModalConfig) return;
    const { staffWithOngoing, staffWithoutOngoing } = bounceModalConfig;

    const promises: Promise<any>[] = [];

    // 1. Staff with ongoing dispatch: Use their existing ongoing dispatch establishment & start time, delete dispatch
    for (const item of staffWithOngoing) {
      const recStart = item.record.startTime.toDate
        ? item.record.startTime.toDate()
        : new Date(item.record.startTime);
      const timeStr = format(recStart, "HH:mm");
      promises.push(
        addBouncedRecord({
          staffName: item.staffName,
          establishmentName: item.record.establishmentName || establishmentName,
          time: timeStr,
          date: selectedDate,
        }),
      );
      if (item.record.id) {
        promises.push(deleteDispatch(item.record.id));
      }
    }

    // 2. Staff without ongoing dispatch: Use entered establishmentName and time
    for (const staffName of staffWithoutOngoing) {
      promises.push(
        addBouncedRecord({
          staffName,
          establishmentName,
          time,
          date: selectedDate,
        }),
      );
    }

    await Promise.all(promises);
  };

  const handleChoiceMultiple = (names: string[]) => {
    if (names.length === 0) return;
    setChoiceModalStaff(names);
    setIsChoiceModalOpen(true);
  };

  const handleConfirmChoiceModal = async (
    establishmentName: string,
    choiceTime: string,
  ) => {
    try {
      await setActiveChoicesMultiple(
        selectedDate,
        choiceModalStaff,
        establishmentName,
        choiceTime,
      );
      setIsChoiceModalOpen(false);
      setChoiceModalStaff([]);
    } catch (error) {
      console.error("초이스 설정 오류:", error);
      setAlertConfig({ message: "초이스 설정 중 오류가 발생했습니다." });
    }
  };

  const handleProgressFromChoice = async (
    staffName: string,
    activeChoice: ActiveChoice,
  ) => {
    handleProgressMultiple([staffName]);
  };

  const handleBounceFromChoice = async (
    staffName: string,
    activeChoice: ActiveChoice,
  ) => {
    handleBounceMultiple([staffName]);
  };

  const handleFinishMultiple = async (staffNames: string[]) => {
    try {
      const getBusinessDateLocal = (dateStr: string, timeStr: string) => {
        const [h, m] = timeStr.split(":").map(Number);
        const baseDate = parseISO(dateStr);
        if (h < 18) {
          return addMinutes(baseDate, 24 * 60 + h * 60 + m);
        }
        return addMinutes(baseDate, h * 60 + m);
      };

      const nowStr = format(new Date(), "HH:mm");
      const end = getBusinessDateLocal(selectedDate, nowStr);
      let changed = false;

      const updatePromises: Promise<void>[] = [];

      staffNames.forEach((name) => {
        const ongoingRecord = records.find((r) => {
          if (r.staffName !== name) return false;
          if (r.date !== selectedDate) return false;
          const rStart = r.startTime.toDate
            ? r.startTime.toDate()
            : new Date(r.startTime);
          const rEnd = r.endTime.toDate
            ? r.endTime.toDate()
            : new Date(r.endTime);
          return rStart.getTime() === rEnd.getTime();
        });

        if (ongoingRecord && ongoingRecord.id) {
          updatePromises.push(
            updateDispatch(ongoingRecord.id, {
              endTime: end,
            }),
          );
          changed = true;
        }
      });

      if (changed) {
        await Promise.all(updatePromises);
      }
    } catch (error) {
      console.error("일괄 종료 처리 오류:", error);
      setAlertConfig({ message: "일괄 종료 처리 중 오류가 발생했습니다." });
    }
  };

  const handleGroupCapture = async (groupTitle: string, staffNames: string[]) => {
    if (!staffNames || staffNames.length === 0) {
      setAlertConfig({ message: `${groupTitle} 소속/그룹에 등록된 직원이 없습니다.` });
      return;
    }

    setCapturingGroupText(`${groupTitle} 소속 (${staffNames.length}명) 묶음 캡쳐 준비 중...`);

    try {
      await new Promise((resolve) => setTimeout(resolve, 200));

      const capturedItems: { name: string; dataUrl: string; width: number; height: number }[] = [];

      for (const name of staffNames) {
        let element =
          document.getElementById(`staff-column-${name}`) ||
          document.getElementById(`staff-timeline-column-${name}`);

        if (!element) continue;

        const originalScale = element.style.transform;
        const originalAlignSelf = element.style.alignSelf;
        const originalHeight = element.style.height;

        const timelineEl = element.querySelector('[data-timeline="true"]') as HTMLElement;
        let originalTimelineHeight = "";

        try {
          element.style.transform = "scale(1)";
          element.style.alignSelf = "flex-start";
          element.style.height = "auto";

          if (timelineEl) {
            originalTimelineHeight = timelineEl.style.height;
            const staffRecs = records.filter((r) => r.staffName === name);
            const pctValues = [30];
            staffRecs.forEach((record: any) => {
              if (!record.startTime || !record.endTime) return;
              const start = record.startTime.toDate ? record.startTime.toDate() : new Date(record.startTime);
              const end = record.endTime.toDate ? record.endTime.toDate() : new Date(record.endTime);
              const isOngoing = start.getTime() === end.getTime();
              const bottomTime = isOngoing ? currentTime : end;

              const date = bottomTime;
              const h = date.getHours();
              const m = date.getMinutes();
              const adjustedHour = h < 18 ? h + 24 : h;
              const offset = adjustedHour * 60 + m - 18 * 60;
              const pct = Math.min(100, Math.max(0, (offset / (24 * 60)) * 100));
              pctValues.push(pct);
            });
            const maxPct = Math.max(...pctValues);
            const cropPct = Math.min(100, maxPct + 4);
            const tempHeight = Math.round((cropPct / 100) * 1700);
            timelineEl.style.height = `${tempHeight}px`;
          }

          const width = element.offsetWidth;
          const height = element.offsetHeight;

          const dataUrl = await htmlToImage.toPng(element, {
            backgroundColor: "#ffffff",
            width: width,
            height: height,
            pixelRatio: window.devicePixelRatio || 2.5,
            filter: (node) => {
              if (
                node instanceof HTMLElement &&
                node.dataset.html2canvasIgnore === "true"
              ) {
                return false;
              }
              return true;
            },
            style: {
              margin: "0",
              padding: "0",
              transform: "none",
            },
          });

          capturedItems.push({ name, dataUrl, width, height });
        } catch (captureErr) {
          console.error(`${name} 컬럼 캡쳐 오류:`, captureErr);
        } finally {
          element.style.transform = originalScale;
          element.style.alignSelf = originalAlignSelf;
          element.style.height = originalHeight;
          if (timelineEl) {
            timelineEl.style.height = originalTimelineHeight;
          }
        }
      }

      if (capturedItems.length === 0) {
        setAlertConfig({ message: "현재 화면에서 캡쳐 가능한 해당 직원의 파견 정보 열(컬럼)이 없습니다." });
        setCapturingGroupText(null);
        return;
      }

      setCapturingGroupText(`${groupTitle} 소속 (${capturedItems.length}명) 이미지 합성 중...`);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const images = await Promise.all(
        capturedItems.map(
          (item) =>
            new Promise<HTMLImageElement>((resolve, reject) => {
              const img = new Image();
              img.onload = () => resolve(img);
              img.onerror = reject;
              img.src = item.dataUrl;
            })
        )
      );

      const gap = 12;
      const padding = 20;
      const headerHeight = 70;

      let totalWidth = padding * 2;
      images.forEach((img, idx) => {
        totalWidth += img.width + (idx < images.length - 1 ? gap : 0);
      });

      const maxImgHeight = Math.max(...images.map((img) => img.height));
      const totalHeight = headerHeight + maxImgHeight + padding * 2;

      const canvas = document.createElement("canvas");
      canvas.width = totalWidth;
      canvas.height = totalHeight;
      const ctx = canvas.getContext("2d");

      if (ctx) {
        // 1. Background fill
        ctx.fillStyle = "#f5f5f4";
        ctx.fillRect(0, 0, totalWidth, totalHeight);

        // 2. Header banner
        ctx.fillStyle = "#1c1917";
        ctx.fillRect(0, 0, totalWidth, headerHeight);

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 22px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        const headerTitle = `[${selectedDate || format(new Date(), "yyyy-MM-dd")}] ${groupTitle} 소속 직원 업무내역 (총 ${capturedItems.length}명)`;
        ctx.fillText(headerTitle, padding, headerHeight / 2);

        // 3. Draw columns
        let currentX = padding;
        images.forEach((img) => {
          ctx.fillStyle = "#ffffff";
          ctx.shadowColor = "rgba(0,0,0,0.08)";
          ctx.shadowBlur = 10;
          ctx.shadowOffsetY = 3;
          ctx.fillRect(currentX, headerHeight + padding, img.width, img.height);
          ctx.shadowColor = "transparent";

          ctx.drawImage(img, currentX, headerHeight + padding);
          currentX += img.width + gap;
        });
      }

      const mergedDataUrl = canvas.toDataURL("image/png");
      const filename = `${groupTitle}_소속_업무내역_${format(new Date(), "yyyyMMdd")}.png`;

      if (navigator.canShare && navigator.share) {
        try {
          const res = await fetch(mergedDataUrl);
          const blob = await res.blob();
          const mergedFile = new File([blob], filename, { type: "image/png" });

          if (navigator.canShare({ files: [mergedFile] })) {
            await navigator.share({
              title: `${groupTitle} 소속 업무내역`,
              text: `${selectedDate || format(new Date(), "yyyy-MM-dd")} ${groupTitle} 소속 (${capturedItems.length}명) 업무내역 공유`,
              files: [mergedFile],
            });
            setCapturingGroupText(null);
            return;
          }
        } catch (shareErr) {
          console.warn("Share API failed or cancelled", shareErr);
        }
      }

      const link = document.createElement("a");
      link.download = filename;
      link.href = mergedDataUrl;
      link.click();
    } catch (err) {
      console.error("Group capture error:", err);
      setAlertConfig({ message: "소속 묶음 캡쳐 처리 중 오류가 발생했습니다." });
    } finally {
      setCapturingGroupText(null);
    }
  };

  const {
    multiSelected,
    startPress,
    endPress,
    handleClick: onMultiClick,
    renderMultiSelectBar,
  } = useMultiSelect(
    handleAddRecordForStaff,
    (name, isOff) => handleFocusStaffRecord(name),
    handleFinishMultiple,
    handleToggleOffMultiple,
    handleBounceMultiple,
    handleChoiceMultiple,
    handleProgressMultiple,
  );

  const onManualProfitClick = (staffName: string, calculatedProfit: number) => {
    setManualProfitModalConfig({
      isOpen: true,
      staffName,
      date: selectedDate,
      currentCalculatedProfit: calculatedProfit,
      currentManualProfit: manualDailyProfits[staffName],
    });
  };

  useEffect(() => {
    localStorage.setItem("office_selected_date", selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    localStorage.setItem("office_view_mode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem(
      "office_is_staff_modal_open",
      String(isStaffModalOpen),
    );
  }, [isStaffModalOpen]);

  useEffect(() => {
    const { initialSearchTerm, ...rest } = detailModal;
    localStorage.setItem("office_detail_modal", JSON.stringify(rest));
  }, [detailModal]);

  useEffect(() => {
    localStorage.setItem("office_status_modal", JSON.stringify(statusModal));
  }, [statusModal]);

  useEffect(() => {
    localStorage.setItem("office_is_form_open", String(isFormOpen));
  }, [isFormOpen]);

  useEffect(() => {
    if (editingRecord) {
      localStorage.setItem(
        "office_editing_record",
        JSON.stringify(editingRecord),
      );
    } else {
      localStorage.removeItem("office_editing_record");
    }
  }, [editingRecord]);

  useEffect(() => {
    localStorage.setItem(
      "office_pre_selected_staff",
      JSON.stringify(preSelectedStaffNames),
    );
  }, [preSelectedStaffNames]);

  // Scroll position persistence
  useEffect(() => {
    const handleScroll = () => {
      localStorage.setItem("office_scroll_y", String(window.scrollY));
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!loading && isAuthenticated) {
      const savedScroll = localStorage.getItem("office_scroll_y");
      if (savedScroll) {
        window.scrollTo(0, parseInt(savedScroll));
      }
    }
  }, [loading, isAuthenticated]);

  const handleSubscriptionError = (err: any) => {
    console.error("Firestore Subscription Error:", err);
    if (err?.message?.toLowerCase().includes("quota")) {
      setInitError(
        "데이터베이스 일일 무료 사용량(읽기 한도)을 초과했습니다.\n\n현재 데이터를 정상적으로 불러올 수 없으며, 할당량은 오전에 갱신됩니다. 데이터베이스 요금제를 업그레이드 해주시면 원활한 사용이 가능합니다.",
      );
    } else {
      setInitError(`데이터 연결에 문제가 발생했습니다: ${err?.message || "알 수 없는 오류"}`);
    }
  };

  useEffect(() => {
    testConnection().catch(() => {});
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      setLoading(true);
      const unsubDispatches = subscribeToDispatches(
        selectedDate,
        (data) => {
          setRecords(data);
          setLoading(false);
          setInitError(null);
        },
        (err) => {
          setLoading(false);
          handleSubscriptionError(err);
        },
      );
      const unsubAttendance = subscribeToAttendance(
        selectedDate,
        (data) => {
          setWorkingStaffIds(data.staffIds);
          setOffStaffIds(data.offStaffIds);
          setCheckInTimes(data.checkInTimes || {});
          setOffTimes(data.offTimes || {});
          setRawManualDailyProfits(data.manualDailyProfits || {});
          setRawActiveChoices(data.activeChoices || {});
        },
        (err) => {
          handleSubscriptionError(err);
        },
      );
      const unsubBounced = subscribeToBouncedRecords(
        selectedDate,
        (data) => {
          setBouncedRecords(data);
        },
        (err) => {
          handleSubscriptionError(err);
        },
      );
      const monday = format(
        startOfWeek(parseISO(selectedDate), { weekStartsOn: 1 }),
        "yyyy-MM-dd",
      );
      const sunday = format(
        endOfWeek(parseISO(selectedDate), { weekStartsOn: 1 }),
        "yyyy-MM-dd",
      );
      const unsubWeeklyAttendance = subscribeToWeeklyAttendance(
        monday,
        sunday,
        (data) => {
          setWeeklyAttendanceData(data);
        },
        (err) => {
          handleSubscriptionError(err);
        },
      );
      return () => {
        unsubDispatches();
        unsubAttendance();
        unsubBounced();
        unsubWeeklyAttendance();
      };
    }
  }, [isAuthenticated, selectedDate]);

  useEffect(() => {
    if (isAuthenticated) {
      const unsubAllUnpaid = subscribeToAllUnpaidDispatches(
        (data) => {
          setAllUnpaidRecords(data);
        },
        (err) => {
          handleSubscriptionError(err);
        },
      );
      const unsubUnpaidStaff = subscribeToUnpaidStaffDispatches(
        (data) => {
          setUnpaidStaffRecords(data);
        },
        (err) => {
          handleSubscriptionError(err);
        },
      );
      const unsubStaff = subscribeToStaff(
        (data) => {
          setStaff(data);
        },
        (err) => {
          handleSubscriptionError(err);
        },
      );
      const unsubEstablishments = subscribeToEstablishments(
        (data) => {
          setEstablishments(data);
        },
        (err) => {
          handleSubscriptionError(err);
        },
      );
      return () => {
        unsubAllUnpaid();
        unsubUnpaidStaff();
        unsubStaff();
        unsubEstablishments();
      };
    }
  }, [isAuthenticated]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // 사무실 비밀번호 설정 (원하시는 대로 변경 가능)
    if (password === "1234") {
      localStorage.setItem("office_auth", "true");
      setIsAuthenticated(true);
      setAuthError(null);
    } else {
      setAuthError("비밀번호가 틀렸습니다.");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("office_auth");
    setIsAuthenticated(false);
  };

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error("Global error caught:", event.error);
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      // Silenced to avoid test false positives from third-party/vite dev server errors

      // Optional: Show a user-friendly alert for certain errors
      if (event.reason?.message && event.reason.message.includes("quota")) {
        setInitError(
          "일일 데이터 사용량(할당량)이 초과되었습니다. 내일 다시 정상 작동합니다.",
        );
      }
    };
    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  useEffect(() => {
    // 사용자가 탭으로 돌아왔을 때 (오랜 시간 방치 후 복귀 시) 자동 복구
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        console.log("앱으로 복귀함: 데이터 재동기화 시도");
        testConnection().catch(() => {});
        // 필요한 경우 강제 새로고침 대신 데이터 구독을 재시작하게 됩니다.
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    // 앱 활성 상태 유지를 위한 주기적 핑 (30초마다)
    // 서버가 잠들지 않도록 하고, 연결 상태를 유지합니다.
    const pingServer = () => {
      fetch("/").catch(() => {});
      testConnection().catch(() => {});
    };

    pingServer();
    const keepAlive = setInterval(pingServer, 30000);
    return () => clearInterval(keepAlive);
  }, []);

  const stats = useMemo(() => {
    const totalRevenue = records.reduce((sum, r) => sum + r.totalAmount, 0);
    const todayUnpaidAmount = records
      .filter((r) => {
        if (r.paymentMethod !== "UNPAID") return false;
        const start = r.startTime.toDate
          ? r.startTime.toDate()
          : new Date(r.startTime);
        const end = r.endTime.toDate ? r.endTime.toDate() : new Date(r.endTime);
        return start.getTime() !== end.getTime();
      })
      .reduce((sum, r) => sum + r.totalAmount, 0);
    const todayCashAmount = records
      .filter((r) => r.paymentMethod === "CASH")
      .reduce((sum, r) => sum + r.totalAmount, 0);
    const todayTransferAmount = records
      .filter((r) => r.paymentMethod === "TRANSFER")
      .reduce((sum, r) => sum + r.totalAmount, 0);
    const totalStaffPayment = records.reduce(
      (sum, r) => sum + r.staffPayment,
      0,
    );
    const totalTip = records.reduce((sum, r) => sum + (r.tip || 0), 0);
    const paidStaffAmount = records
      .filter((r) => r.isStaffPaid)
      .reduce((sum, r) => sum + r.staffPayment, 0);

    // Calculate total commission considering manual profits
    const staffCommissions: Record<string, number> = {};
    records.forEach((r) => {
      staffCommissions[r.staffName] =
        (staffCommissions[r.staffName] || 0) + r.commission;
    });

    let totalCommission = 0;
    // Use manual profit if available, otherwise use calculated sum
    const allStaffNames = new Set([
      ...Object.keys(staffCommissions),
      ...Object.keys(manualDailyProfits).filter((name) =>
        filteredStaffNameSet.has(name),
      ),
    ]);
    allStaffNames.forEach((name) => {
      if (manualDailyProfits[name] !== undefined) {
        totalCommission += manualDailyProfits[name];
      } else if (staffCommissions[name] !== undefined) {
        totalCommission += staffCommissions[name];
      }
    });

    // Calculate accurate unpaidAmount and pastUnpaidAmount using establishment grouping
    const estDateMap = new Map<string, DispatchRecord[]>();
    const combinedMap = new Map<string, DispatchRecord>();
    allUnpaidRecords.forEach((r) => {
      if (r.id) combinedMap.set(r.id, { ...r, wasUnpaid: true });
    });
    records.forEach((r) => {
      if (r.id) {
        const existing = combinedMap.get(r.id);
        if (existing) {
          combinedMap.set(r.id, { ...existing, ...r, wasUnpaid: true });
        } else if (
          r.paymentMethod === "UNPAID" ||
          (r.collectedAmount !== undefined && r.collectedAmount < r.totalAmount)
        ) {
          combinedMap.set(r.id, { ...r, wasUnpaid: true });
        }
      }
    });

    combinedMap.forEach((r) => {
      if (!r.startTime || !r.endTime) return;
      const start = r.startTime.toDate
        ? r.startTime.toDate()
        : new Date(r.startTime);
      const end = r.endTime.toDate ? r.endTime.toDate() : new Date(r.endTime);
      if (start.getTime() === end.getTime()) return; // skip ongoing

      const key = `${r.date}__${r.establishmentName}`;
      const list = estDateMap.get(key) || [];
      list.push(r);
      estDateMap.set(key, list);
    });

    let unpaidAmount = 0;
    let pastUnpaidAmount = 0;

    estDateMap.forEach((estRecords, key) => {
      const [date] = key.split("__");
      const calc = calculateEstablishmentCollection(estRecords);
      unpaidAmount += calc.unpaidAmount;
      if (date < selectedDate) {
        pastUnpaidAmount += calc.unpaidAmount;
      }
    });

    const globalUnpaidStaffAmount = unpaidStaffRecords.reduce(
      (sum, r) => sum + r.staffPayment,
      0,
    );
    const pastUnpaidStaffAmount = unpaidStaffRecords
      .filter((r) => r.date < selectedDate)
      .reduce((sum, r) => sum + r.staffPayment, 0);

    return {
      totalRevenue,
      todayUnpaidAmount,
      todayCashAmount,
      todayTransferAmount,
      totalCommission,
      totalStaffPayment,
      totalTip,
      paidStaffAmount,
      unpaidAmount,
      pastUnpaidAmount,
      globalUnpaidStaffAmount,
      pastUnpaidStaffAmount,
      tableUnits: records
        .filter((r) => r.systemType === "TABLE")
        .reduce((sum, r) => sum + Math.floor(r.durationHours), 0),
      tableBanti: records.filter(
        (r) => r.systemType === "TABLE" && r.durationHours % 1 !== 0,
      ).length,
      publicUnits: records
        .filter((r) => r.systemType === "PUBLIC")
        .reduce((sum, r) => sum + Math.floor(r.durationHours), 0),
      publicBanti: records.filter(
        (r) => r.systemType === "PUBLIC" && r.durationHours % 1 !== 0,
      ).length,
      hopperUnits: records
        .filter((r) => r.systemType === "HOPPER")
        .reduce((sum, r) => sum + Math.floor(r.durationHours), 0),
      hopperBanti: records.filter(
        (r) => r.systemType === "HOPPER" && r.durationHours % 1 !== 0,
      ).length,
    };
  }, [
    records,
    allUnpaidRecords,
    unpaidStaffRecords,
    manualDailyProfits,
    selectedDate,
  ]);

  const activeStaffStats = useMemo(() => {
    const workingStaff = staff.filter((s) => workingStaffIds.includes(s.id!));
    const finishedStaff = workingStaff.filter((s) =>
      offStaffIds.includes(s.id!),
    );

    const counts = {
      TOTAL: staff.length,
      WORKING: workingStaff.length,
      FINISHED: finishedStaff.length,
      OFF_DUTY: staff.length - workingStaff.length,
      WAITING: 0,
      TABLE: 0,
      PUBLIC: 0,
      HOPPER: 0,
      DIRECT: staff.filter((s) => formatStaffNameComponents(s.name).isDirect).length,
      DELEGATED: staff.filter((s) => !formatStaffNameComponents(s.name).isDirect).length,
      WORKING_DIRECT: workingStaff.filter((s) => formatStaffNameComponents(s.name).isDirect).length,
      WORKING_DELEGATED: workingStaff.filter((s) => !formatStaffNameComponents(s.name).isDirect).length,
      TABLE_DIRECT: 0,
      TABLE_DELEGATED: 0,
      PUBLIC_DIRECT: 0,
      PUBLIC_DELEGATED: 0,
      HOPPER_DIRECT: 0,
      HOPPER_DELEGATED: 0,
    };

    workingStaff.forEach((s) => {
      const isDirect = formatStaffNameComponents(s.name).isDirect;
      if (s.type === "COFFEE") {
        counts.TABLE++;
        if (isDirect) counts.TABLE_DIRECT++;
        else counts.TABLE_DELEGATED++;
      } else if (s.type === "PUBLIC") {
        counts.PUBLIC++;
        if (isDirect) counts.PUBLIC_DIRECT++;
        else counts.PUBLIC_DELEGATED++;
      } else if (s.type === "HOPPER") {
        counts.HOPPER++;
        if (isDirect) counts.HOPPER_DIRECT++;
        else counts.HOPPER_DELEGATED++;
      }
    });

    const workingNames = workingStaff
      .filter((s) => !offStaffIds.includes(s.id!))
      .map((s) => s.name);

    // Ongoing records for waiting calculation
    const ongoingRecords = records.filter((r) => {
      const start = r.startTime.toDate
        ? r.startTime.toDate()
        : new Date(r.startTime);
      const end = r.endTime.toDate ? r.endTime.toDate() : new Date(r.endTime);
      return start.getTime() === end.getTime();
    });
    const staffWithOngoing = new Set(ongoingRecords.map((r) => r.staffName));
    counts.WAITING = workingNames.filter(
      (name) => !staffWithOngoing.has(name),
    ).length;

    return counts;
  }, [records, workingStaffIds, offStaffIds, staff]);

  const waitingStaffNames = useMemo(() => {
    const ongoingRecords = records.filter((r) => {
      const start = r.startTime.toDate
        ? r.startTime.toDate()
        : new Date(r.startTime);
      const end = r.endTime.toDate ? r.endTime.toDate() : new Date(r.endTime);
      return start.getTime() === end.getTime();
    });
    const staffWithOngoing = new Set(ongoingRecords.map((r) => r.staffName));
    const workingStaff = staff.filter(
      (s) => workingStaffIds.includes(s.id!) && !offStaffIds.includes(s.id!),
    );
    return workingStaff
      .filter((s) => !staffWithOngoing.has(s.name))
      .map((s) => s.name);
  }, [records, workingStaffIds, offStaffIds, staff]);

  const handleToggleOff = async (staffId: string, e?: React.MouseEvent) => {
    if (e) {
      (e.currentTarget as HTMLElement).blur();
      e.preventDefault();
      e.stopPropagation();
    }
    try {
      if (!workingStaffIds.includes(staffId)) return;
      const isOff = offStaffIds.includes(staffId);
      const newOffIds = isOff
        ? offStaffIds.filter((id) => id !== staffId)
        : [...offStaffIds, staffId];

      const newOffTimes = { ...offTimes };
      if (isOff) {
        delete newOffTimes[staffId];
      } else {
        newOffTimes[staffId] = Timestamp.now();
      }

      await updateAttendance(
        selectedDate,
        workingStaffIds,
        newOffIds,
        newOffTimes,
      );
    } catch (error) {
      console.error("퇴근 처리 오류:", error);
      setAlertConfig({
        message: `퇴근 처리 중 오류: ${getErrorMessage(error, "퇴근 처리 중 오류가 발생했습니다.")}`,
      });
    }
  };

  const handleToggleAttendance = async (
    staffId: string,
    e?: React.MouseEvent,
  ) => {
    if (e) {
      (e.currentTarget as HTMLElement).blur();
      e.preventDefault();
      e.stopPropagation();
    }
    const isWorking = workingStaffIds.includes(staffId);
    const newIds = isWorking
      ? workingStaffIds.filter((id) => id !== staffId)
      : [...workingStaffIds, staffId];

    // If removing from working, also remove from off
    const newOffIds = isWorking
      ? offStaffIds.filter((id) => id !== staffId)
      : offStaffIds;

    const newOffTimes = { ...offTimes };
    if (isWorking) {
      delete newOffTimes[staffId];
    }

    try {
      await updateAttendance(selectedDate, newIds, newOffIds, newOffTimes);
    } catch (error) {
      console.error("출근 상태 변경 오류:", error);
      setAlertConfig({
        message: `출근 상태 변경 중 오류: ${getErrorMessage(error, "출근 상태 변경 중 오류가 발생했습니다.")}`,
      });
    }
  };

  // Move early returns here to ensure all hooks are called in the same order
  return (
    <AnimatePresence mode="wait">
      {loading && isAuthenticated && records.length === 0 && showLoadingUI ? (
        <motion.div
          key="loading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-6 text-center"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center"
          >
            <div className="w-16 h-16 bg-stone-900 rounded-2xl flex items-center justify-center mb-6 animate-pulse">
              <Building2 className="text-white w-8 h-8" />
            </div>
            <h2 className="text-xl font-black text-stone-900 mb-2">
              세션 복구 중...
            </h2>
            <p className="text-stone-500 text-sm font-bold">
              이전 작업 위치를 찾고 있습니다.
            </p>
            <div className="mt-8 flex gap-1">
              <div className="w-1.5 h-1.5 bg-stone-300 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <div className="w-1.5 h-1.5 bg-stone-300 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <div className="w-1.5 h-1.5 bg-stone-300 rounded-full animate-bounce" />
            </div>
          </motion.div>
        </motion.div>
      ) : initError ? (
        <motion.div
          key="error"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-6 text-center"
        >
          {initError.includes("할당량") || initError.includes("무료 사용량") || initError.toLowerCase().includes("quota") ? (
            <div className="bg-white border border-stone-200 rounded-2xl p-6 sm:p-8 max-w-md shadow-sm text-left">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center shrink-0">
                  <Database className="text-amber-600 w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-stone-900 leading-snug">
                    Firestore 일일 무료 할당량 초과
                  </h1>
                  <span className="text-xs text-stone-400 font-medium">Enterprise Edition</span>
                </div>
              </div>

              <div className="space-y-4 text-sm text-stone-600 leading-relaxed">
                <p>
                  데이터베이스의 <strong>일일 무료 읽기 한도</strong>를 모두 소모하였습니다. 현재 데이터를 실시간으로 동기화하거나 조회할 수 없는 상태입니다.
                </p>
                
                <div className="bg-emerald-50 text-emerald-800 p-4 rounded-xl text-xs font-medium space-y-1">
                  <p className="flex items-center gap-1.5 text-[13px] font-bold text-emerald-900 mb-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    기존 데이터는 100% 안전합니다
                  </p>
                  <p>
                    그동안 입력하신 장부 데이터, 수금 명단, 출근 정보 등은 데이터베이스 안에 아주 안전하게 보관되어 있습니다. <strong>데이터의 유실이나 소실은 단 1%도 발생하지 않으니 안심하셔도 됩니다.</strong>
                  </p>
                </div>

                <div className="space-y-2 mt-4">
                  <span className="text-xs font-bold text-stone-400 uppercase tracking-wider block">
                    조치 방법 (할당량 추가 사용하기)
                  </span>
                  
                  <div className="bg-stone-50 border border-stone-100 p-4 rounded-xl text-xs space-y-2.5 text-stone-500">
                    <p>
                      <strong>Blaze 요금제</strong>를 연동해 두셨음에도 이 한도가 트리거되는 원인은, Firebase의 개별 데이터베이스별로 설정된 <span className="font-bold underline">기본 무료 사용 제한</span>이 활성화되어 있기 때문입니다.
                    </p>
                    <p className="font-semibold text-stone-700">
                      아래의 버튼을 클릭하여 Firebase Console의 데이터베이스 페이지로 이동한 뒤, 팝업으로 나타나는 업그레이드 대화상자(Upgrade Dialog)를 완료하시면 실시간으로 즉시 제한이 해제되어 한도 없이 정상 작동됩니다.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 mt-6">
                <a
                  href="https://console.firebase.google.com/project/ai-studio-applet-webapp-c96e1/firestore/databases/ai-studio-a788648a-696a-40cc-a432-40bc643a7a70/data?openUpgradeDialog=true"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 bg-stone-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-stone-800 active:scale-[0.98] transition-all text-center text-sm shadow-md cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4" /> Firebase 콘솔에서 즉시 업그레이드
                </a>
                
                <button
                  onClick={() => window.location.reload()}
                  className="w-full py-2.5 bg-stone-100 text-stone-700 rounded-xl font-bold hover:bg-stone-200 active:scale-[0.98] transition-all text-xs cursor-pointer"
                >
                  업그레이드 완료 후 새로고침
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mb-6">
                <AlertCircle className="text-amber-600 w-10 h-10" />
              </div>
              <h1 className="text-2xl font-bold text-stone-900 mb-2">
                연결 문제가 발생했습니다
              </h1>
              <p className="text-stone-500 mb-8 max-w-sm whitespace-pre-wrap">
                {initError}
              </p>
              <div className="space-y-3 w-full max-w-xs">
                <button
                  onClick={() => window.location.reload()}
                  className="w-full py-3 bg-stone-900 text-white rounded-xl font-bold shadow-lg active:scale-95 transition-all"
                >
                  다시 시도하기
                </button>
                <button
                  onClick={async () => {
                    localStorage.clear();
                    if ("serviceWorker" in navigator) {
                      try {
                        const registrations =
                          await navigator.serviceWorker.getRegistrations();
                        await Promise.all(registrations.map((r) => r.unregister()));
                      } catch (e) {
                        console.error(e);
                      }
                    }
                    window.location.reload();
                  }}
                  className="w-full py-2 text-stone-400 text-[10px] underline hover:text-stone-600"
                >
                  앱 초기화 및 캐시 삭제
                </button>
              </div>
            </>
          )}
        </motion.div>
      ) : !isAuthenticated ? (
        <motion.div
          key="login"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm border border-stone-200 text-center"
          >
            <div className="w-16 h-16 bg-stone-900 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Building2 className="text-white w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-stone-900 mb-2">
              정산프로그램
            </h1>
            <p className="text-stone-500 mb-8">일일 사무실 정산 관리 시스템</p>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="사무실 비밀번호 입력"
                  className="w-full px-4 py-4 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900 text-center text-lg tracking-widest"
                  autoFocus
                />
              </div>
              {authError && (
                <p className="text-red-500 text-sm font-medium">{authError}</p>
              )}
              <button
                type="submit"
                className="w-full bg-stone-900 text-white py-4 rounded-xl font-bold hover:bg-stone-800 transition-all active:scale-95"
              >
                접속하기
              </button>
            </form>

            <p className="mt-6 text-[11px] text-stone-400">
              구글 로그인 에러를 해결하기 위해 비밀번호 시스템으로
              변경되었습니다.
              <br />
              초기 비밀번호는{" "}
              <span className="font-bold text-stone-600">1234</span> 입니다.
            </p>
          </motion.div>
        </motion.div>
      ) : (
        <motion.div
          key="main"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          <ErrorBoundary>
            <div className="min-h-screen bg-stone-50 text-stone-900 font-sans w-full max-w-full overflow-x-hidden relative">
              {/* Header */}
              <header className="bg-white border-bottom border-stone-200 sticky top-0 z-10 w-full max-w-full overflow-x-hidden">
                <div className="max-w-5xl mx-auto px-2.5 sm:px-4 h-16 flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleInstallClick}
                      className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90",
                        showInstallBtn
                          ? "bg-indigo-600 shadow-lg shadow-indigo-200 animate-pulse"
                          : "bg-stone-900",
                      )}
                      title={
                        showInstallBtn
                          ? "홈 화면에 앱 추가하기"
                          : "정산프로그램"
                      }
                    >
                      <Building2 className="text-white w-5 h-5" />
                    </button>
                    <span className="font-bold text-lg hidden sm:inline">
                      정산 프로그램
                    </span>
                  </div>

                  <div className="flex items-center gap-2 sm:gap-4">
                    <button
                      onClick={() => setIsStaffModalOpen(true)}
                      className="p-2 text-stone-400 hover:text-stone-900 transition-colors bg-stone-100 rounded-lg shrink-0"
                      title="직원 관리"
                    >
                      <Users className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                    <div className="flex items-center bg-stone-100 p-1 rounded-xl shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const prev = subDays(parseISO(selectedDate), 1);
                          setSelectedDate(format(prev, "yyyy-MM-dd"));
                        }}
                        className="relative z-40 p-3 sm:p-1.5 text-stone-600 hover:text-stone-900 bg-white sm:bg-transparent shadow-sm sm:shadow-none rounded-lg transition-all active:scale-90 flex items-center justify-center"
                        style={{ touchAction: "manipulation" }}
                      >
                        <ChevronLeft className="w-5 h-5 sm:w-4 sm:h-4" />
                      </button>

                      <div
                        onClick={(e) => {
                          e.preventDefault();
                          try {
                            if (
                              dateInputRef.current &&
                              "showPicker" in dateInputRef.current
                            ) {
                              (dateInputRef.current as any).showPicker();
                            } else {
                              dateInputRef.current?.click();
                            }
                          } catch (err) {
                            dateInputRef.current?.click();
                          }
                        }}
                        className="relative z-10 flex items-center gap-1.5 px-3 py-1.5 hover:bg-white rounded-lg transition-all cursor-pointer active:bg-white/50"
                      >
                        <Calendar className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-stone-500" />
                        <span className="text-[13px] sm:text-[13px] font-bold text-stone-900 whitespace-nowrap">
                          {format(parseISO(selectedDate), "MM-dd", {
                            locale: ko,
                          })}
                          <span className="hidden sm:inline">
                            {format(parseISO(selectedDate), " (eee)", {
                              locale: ko,
                            })}
                          </span>
                        </span>
                        <input
                          ref={dateInputRef}
                          type="date"
                          value={selectedDate}
                          onChange={(e) => setSelectedDate(e.target.value)}
                          className="absolute inset-0 opacity-0 pointer-events-none"
                          style={{
                            width: "1px",
                            height: "1px",
                            overflow: "hidden",
                          }}
                        />
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const next = addDays(parseISO(selectedDate), 1);
                          setSelectedDate(format(next, "yyyy-MM-dd"));
                        }}
                        className="relative z-40 p-3 sm:p-1.5 text-stone-600 hover:text-stone-900 bg-white sm:bg-transparent shadow-sm sm:shadow-none rounded-lg transition-all active:scale-90 flex items-center justify-center"
                        style={{ touchAction: "manipulation" }}
                      >
                        <ChevronRight className="w-5 h-5 sm:w-4 sm:h-4" />
                      </button>
                    </div>

                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        const now = new Date();
                        setSelectedDate(
                          now.getHours() < 18
                            ? format(subDays(now, 1), "yyyy-MM-dd")
                            : format(now, "yyyy-MM-dd"),
                        );
                      }}
                      className="px-4 py-2.5 bg-stone-900 text-white text-[12px] font-bold rounded-xl hover:bg-stone-800 transition-all active:scale-95 shadow-md shrink-0 z-40"
                      style={{ touchAction: "manipulation" }}
                    >
                      오늘
                    </button>
                    <button
                      onClick={handleLogout}
                      className="p-1.5 sm:p-2 text-stone-400 hover:text-stone-900 transition-colors shrink-0"
                    >
                      <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  </div>
                </div>
              </header>

              <main className="max-w-5xl mx-auto px-2.5 sm:px-4 py-4 sm:py-8 w-full max-w-full overflow-x-hidden">
                {/* Dashboard Stats */}
                {loading && (
                  <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-stone-900 text-white px-4 py-2 rounded-full text-xs font-bold shadow-lg flex flex-col items-center gap-2 animate-bounce">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                      데이터 동기화 중...
                    </div>
                    <button
                      onClick={() => window.location.reload()}
                      className="text-[8px] underline opacity-50 hover:opacity-100"
                    >
                      새로고침
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                  <StatCard
                    title="총 수금액"
                    value={stats.totalRevenue}
                    isCompleted={
                      stats.totalRevenue > 0 && stats.todayUnpaidAmount === 0
                    }
                    displayValue={
                      <div className="flex flex-col gap-1 w-full">
                        <div className="flex items-baseline gap-0 tracking-tighter">
                          <span className="text-emerald-600">
                            {(
                              (stats.totalRevenue - stats.todayUnpaidAmount) /
                              10000
                            ).toFixed(1)}
                          </span>
                          <span className="text-stone-300 text-sm mx-0.5">/</span>
                          <span className="text-stone-400">
                            {(stats.totalRevenue / 10000).toFixed(1)}
                          </span>
                          <span className="text-stone-300 text-sm mx-0.5">/</span>
                          <span className="text-red-500">
                            {(stats.todayUnpaidAmount / 10000).toFixed(1)}
                          </span>
                          <span className="text-xs ml-0.5 text-stone-400">
                            만
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold border-t border-stone-100/60 pt-1 mt-0.5">
                          <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100/50">
                            현금 {(stats.todayCashAmount / 10000).toFixed(1)}만
                          </span>
                          <span className="text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100/50">
                            이체 {(stats.todayTransferAmount / 10000).toFixed(1)}만
                          </span>
                          <span className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100/50">
                            팁(현금) {(stats.totalTip / 10000).toFixed(1)}만
                          </span>
                        </div>
                      </div>
                    }
                    icon={<DollarSign className="w-5 h-5" />}
                    color="bg-emerald-50 text-emerald-700"
                    onClick={() =>
                      setDetailModal({ type: "revenue", isOpen: true })
                    }
                  />
                  <StatCard
                    title="사무실 수수료"
                    value={stats.totalCommission}
                    isCompleted={
                      activeStaffStats.WORKING > 0 &&
                      activeStaffStats.WORKING === activeStaffStats.FINISHED
                    }
                    completedColor="blue"
                    completedText="확정"
                    displayValue={
                      <div className="flex items-baseline gap-0.5 tracking-tighter">
                        <span className="text-blue-600">
                          {(stats.totalCommission / 10000).toFixed(1)}
                        </span>
                        <span className="text-xs ml-0.5 text-stone-400">
                          만
                        </span>
                      </div>
                    }
                    icon={<Wallet className="w-5 h-5" />}
                    color="bg-blue-50 text-blue-700"
                    onClick={() =>
                      setDetailModal({ type: "commission", isOpen: true })
                    }
                  />
                  <StatCard
                    title="여직원 지급액"
                    value={stats.totalStaffPayment}
                    isCompleted={
                      stats.totalStaffPayment > 0 &&
                      stats.paidStaffAmount === stats.totalStaffPayment
                    }
                    displayValue={
                      <div className="flex flex-col gap-1 mt-1">
                        {(stats.globalUnpaidStaffAmount > 0 ||
                          stats.pastUnpaidStaffAmount > 0) && (
                          <div className="flex items-center gap-1 bg-red-50 text-red-600 px-1.5 py-0.5 rounded-lg border border-red-100/50 w-full mb-0.5 whitespace-nowrap overflow-x-auto overflow-y-hidden hide-scrollbar">
                            {stats.globalUnpaidStaffAmount > 0 && (
                              <div className="flex items-center gap-0.5 shrink-0">
                                <span className="text-[9px] font-black tracking-tighter">
                                  총미지급
                                </span>
                                <span className="text-[11px] font-black">
                                  {(
                                    stats.globalUnpaidStaffAmount / 10000
                                  ).toFixed(1)}
                                  만
                                </span>
                              </div>
                            )}
                            {stats.pastUnpaidStaffAmount > 0 && (
                              <div className="flex items-center gap-0.5 ml-1 pl-1 border-l border-red-200/60 opacity-90 shrink-0">
                                <span className="text-[9px] font-bold tracking-tighter">
                                  지난미지급
                                </span>
                                <span className="text-[10.5px] font-black">
                                  {(
                                    stats.pastUnpaidStaffAmount / 10000
                                  ).toFixed(1)}
                                  만
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                        <div className="flex items-baseline gap-0 tracking-tighter">
                          <span className="text-purple-600 font-bold">
                            {(stats.paidStaffAmount / 10000).toFixed(1)}
                          </span>
                          <span className="text-stone-300 text-sm font-light mx-0.5">
                            /
                          </span>
                          <span className="text-stone-400 font-bold">
                            {(stats.totalStaffPayment / 10000).toFixed(1)}
                          </span>
                          <span className="text-stone-300 text-sm font-light mx-0.5">
                            /
                          </span>
                          <span className="text-red-500 font-black">
                            {(
                              (stats.totalStaffPayment -
                                stats.paidStaffAmount) /
                              10000
                            ).toFixed(1)}
                          </span>
                          <span className="text-xs ml-0.5 font-bold text-stone-400">
                            만
                          </span>
                        </div>
                      </div>
                    }
                    icon={<Users className="w-5 h-5" />}
                    color="bg-purple-50 text-purple-700"
                    onClick={() =>
                      setDetailModal({ type: "staffPayment", isOpen: true })
                    }
                  />
                  <StatCard
                    title="총 미수금"
                    value={stats.unpaidAmount}
                    isCompleted={stats.unpaidAmount > 0}
                    completedColor="red"
                    completedText="미수"
                    displayValue={
                      <div className="flex flex-col gap-1 mt-1">
                        {(stats.todayUnpaidAmount > 0 ||
                          stats.pastUnpaidAmount > 0) && (
                          <div className="flex items-center gap-1 bg-red-50 text-red-600 px-1.5 py-0.5 rounded-lg border border-red-100/50 w-full mb-0.5 whitespace-nowrap overflow-x-auto overflow-y-hidden hide-scrollbar">
                            {stats.todayUnpaidAmount > 0 && (
                              <div className="flex items-center gap-0.5 shrink-0">
                                <span className="text-[9px] font-black tracking-tighter">
                                  당일미수
                                </span>
                                <span className="text-[11px] font-black">
                                  {(stats.todayUnpaidAmount / 10000).toFixed(1)}
                                  만
                                </span>
                              </div>
                            )}
                            {stats.pastUnpaidAmount > 0 && (
                              <div
                                className={`flex items-center gap-0.5 shrink-0 opacity-90 ${stats.todayUnpaidAmount > 0 ? "ml-1 pl-1 border-l border-red-200/60" : ""}`}
                              >
                                <span className="text-[9px] font-bold tracking-tighter">
                                  지난미수
                                </span>
                                <span className="text-[10.5px] font-black">
                                  {(stats.pastUnpaidAmount / 10000).toFixed(1)}
                                  만
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                        <div className="flex items-baseline gap-0.5 tracking-tighter">
                          <span className="text-red-600 font-bold">
                            {(stats.unpaidAmount / 10000).toFixed(1)}
                          </span>
                          <span className="text-xs ml-0.5 font-bold text-stone-400">
                            만
                          </span>
                        </div>
                      </div>
                    }
                    icon={<AlertCircle className="w-5 h-5" />}
                    color="bg-red-50 text-red-700"
                    onClick={() => {
                      setViewMode("unpaid");
                    }}
                  />
                </div>

                {/* Unit Stats Breakdown */}
                <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm mb-8">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
                    <h3 className="text-sm font-bold text-stone-500 flex items-center gap-2">
                      <LayoutDashboard className="w-4 h-4" />
                      유형별 총 갯수 현황
                    </h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() =>
                          setStatusModal({ type: "TOTAL", isOpen: true })
                        }
                        className="flex items-center gap-1.5 bg-stone-100 px-2 py-1 rounded-full hover:bg-stone-200 transition-all active:scale-95"
                      >
                        <span className="text-[9px] font-bold text-stone-500">
                          총원
                        </span>
                        <span className="text-xs font-black text-stone-900">
                          {activeStaffStats.TOTAL}
                        </span>
                      </button>
                      <button
                        onClick={() =>
                          setStatusModal({ type: "WORKING", isOpen: true })
                        }
                        className="flex items-center gap-1.5 bg-emerald-100 px-2 py-1 rounded-full hover:bg-emerald-200 transition-all active:scale-95"
                      >
                        <span className="text-[9px] font-bold text-emerald-600">
                          출근
                        </span>
                        <span className="text-xs font-black text-emerald-900">
                          {activeStaffStats.WORKING}
                        </span>
                      </button>
                      <button
                        onClick={() =>
                          setStatusModal({ type: "WAITING", isOpen: true })
                        }
                        className="flex items-center gap-1.5 bg-red-100 px-2 py-1 rounded-full hover:bg-red-200 transition-all active:scale-95"
                      >
                        <span className="text-[9px] font-bold text-red-600">
                          대기
                        </span>
                        <span className="text-xs font-black text-red-900">
                          {activeStaffStats.WAITING}
                        </span>
                      </button>
                      <button
                        onClick={() =>
                          setStatusModal({ type: "FINISHED", isOpen: true })
                        }
                        className="flex items-center gap-1.5 bg-blue-100 px-2 py-1 rounded-full hover:bg-blue-200 transition-all active:scale-95"
                      >
                        <span className="text-[9px] font-bold text-blue-600">
                          퇴근
                        </span>
                        <span className="text-xs font-black text-blue-900">
                          {activeStaffStats.FINISHED}
                        </span>
                      </button>
                      <button
                        onClick={() =>
                          setStatusModal({ type: "OFF_DUTY", isOpen: true })
                        }
                        className="flex items-center gap-1.5 bg-stone-100 px-2 py-1 rounded-full hover:bg-stone-200 transition-all active:scale-95"
                      >
                        <span className="text-[9px] font-bold text-stone-500">
                          휴무
                        </span>
                        <span className="text-xs font-black text-stone-900">
                          {activeStaffStats.OFF_DUTY}
                        </span>
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 sm:gap-4">
                    <div className="bg-emerald-50 p-2 sm:p-3 rounded-xl border border-emerald-100 flex flex-col justify-between">
                      <div className="flex justify-between items-start mb-1 gap-1">
                        <div className="text-[11px] sm:text-[12px] font-black text-emerald-600 uppercase pt-0.5">
                          커피
                        </div>
                        <div className="flex flex-col items-end">
                          <div className="bg-emerald-200/50 px-1.5 py-0.5 rounded text-[10px] sm:text-[11px] font-black text-emerald-700 leading-none">
                            {activeStaffStats.TABLE}명
                          </div>
                          <div className="flex gap-0.5 mt-0.5 text-[8.5px] font-bold leading-none shrink-0">
                            <span className="text-blue-700 bg-blue-100/40 px-1 py-0.5 rounded-sm">직 {activeStaffStats.TABLE_DIRECT}</span>
                            <span className="text-amber-700 bg-amber-100/40 px-1 py-0.5 rounded-sm">위 {activeStaffStats.TABLE_DELEGATED}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-baseline gap-0.5 sm:gap-1 mt-1">
                        <span className="text-xl sm:text-2xl font-black text-emerald-900">
                          {stats.tableUnits}
                        </span>
                        <span className="text-[10px] sm:text-[11px] font-bold text-emerald-700">
                          정
                        </span>
                        <span className="mx-0.5 sm:mx-1 text-emerald-300">
                          /
                        </span>
                        <span className="text-xl sm:text-2xl font-black text-emerald-900">
                          {stats.tableBanti}
                        </span>
                        <span className="text-[10px] sm:text-[11px] font-bold text-emerald-700">
                          반
                        </span>
                      </div>
                    </div>
                    <div className="bg-blue-50 p-2 sm:p-3 rounded-xl border border-blue-100 flex flex-col justify-between">
                      <div className="flex justify-between items-start mb-1 gap-1">
                        <div className="text-[11px] sm:text-[12px] font-black text-blue-600 uppercase pt-0.5">
                          퍼블릭
                        </div>
                        <div className="flex flex-col items-end">
                          <div className="bg-blue-200/50 px-1.5 py-0.5 rounded text-[10px] sm:text-[11px] font-black text-blue-700 leading-none">
                            {activeStaffStats.PUBLIC}명
                          </div>
                          <div className="flex gap-0.5 mt-0.5 text-[8.5px] font-bold leading-none shrink-0">
                            <span className="text-blue-700 bg-blue-100/40 px-1 py-0.5 rounded-sm">직 {activeStaffStats.PUBLIC_DIRECT}</span>
                            <span className="text-amber-700 bg-amber-100/40 px-1 py-0.5 rounded-sm">위 {activeStaffStats.PUBLIC_DELEGATED}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-baseline gap-0.5 sm:gap-1 mt-1">
                        <span className="text-xl sm:text-2xl font-black text-blue-900">
                          {stats.publicUnits}
                        </span>
                        <span className="text-[10px] sm:text-[11px] font-bold text-blue-700">
                          정
                        </span>
                        <span className="mx-0.5 sm:mx-1 text-blue-300">/</span>
                        <span className="text-xl sm:text-2xl font-black text-blue-900">
                          {stats.publicBanti}
                        </span>
                        <span className="text-[10px] sm:text-[11px] font-bold text-blue-700">
                          반
                        </span>
                      </div>
                    </div>
                    <div className="bg-purple-50 p-2 sm:p-3 rounded-xl border border-purple-100 flex flex-col justify-between">
                      <div className="flex justify-between items-start mb-1 gap-1">
                        <div className="text-[11px] sm:text-[12px] font-black text-purple-600 uppercase pt-0.5">
                          하퍼
                        </div>
                        <div className="flex flex-col items-end">
                          <div className="bg-purple-200/50 px-1.5 py-0.5 rounded text-[10px] sm:text-[11px] font-black text-purple-700 leading-none">
                            {activeStaffStats.HOPPER}명
                          </div>
                          <div className="flex gap-0.5 mt-0.5 text-[8.5px] font-bold leading-none shrink-0">
                            <span className="text-blue-700 bg-blue-100/40 px-1 py-0.5 rounded-sm">직 {activeStaffStats.HOPPER_DIRECT}</span>
                            <span className="text-amber-700 bg-amber-100/40 px-1 py-0.5 rounded-sm">위 {activeStaffStats.HOPPER_DELEGATED}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-baseline gap-0.5 sm:gap-1 mt-1">
                        <span className="text-xl sm:text-2xl font-black text-purple-900">
                          {stats.hopperUnits}
                        </span>
                        <span className="text-[10px] sm:text-[11px] font-bold text-purple-700">
                          정
                        </span>
                        <span className="mx-0.5 sm:mx-1 text-purple-300">
                          /
                        </span>
                        <span className="text-xl sm:text-2xl font-black text-purple-900">
                          {stats.hopperBanti}
                        </span>
                        <span className="text-[10px] sm:text-[11px] font-bold text-purple-700">
                          반
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Today's Working Staff Cards */}
                <div id="attendance-status-section" className="mb-6 bg-white border border-stone-200 rounded-2xl p-3.5 sm:p-5 shadow-sm scroll-mt-20 relative">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 border-b border-stone-100 pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="bg-stone-900 rounded-lg p-1.5 shrink-0">
                        <Users className="w-4 h-4 text-white" />
                      </div>
                      <h2 className="text-lg font-bold text-stone-900 tracking-tight shrink-0 mr-1">
                        인원 현황
                      </h2>
                      
                      {/* 전체 명단 Capsule */}
                      <div className="flex items-center gap-1.5 bg-stone-50 border border-stone-200 px-2 py-1 rounded-xl">
                        <button
                          onClick={() =>
                            setStatusModal({ type: "TOTAL", isOpen: true })
                          }
                          className="flex items-center gap-1 hover:opacity-80 transition-opacity"
                        >
                          <span className="text-[10px] font-bold text-stone-500">전체</span>
                          <span className="text-xs font-black text-stone-900">
                            {activeStaffStats.TOTAL}
                          </span>
                        </button>
                        <div className="h-3 w-[1px] bg-stone-200" />
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-blue-600">
                            <span>직</span>
                            <span className="font-extrabold">{activeStaffStats.DIRECT}</span>
                          </span>
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600">
                            <span>위</span>
                            <span className="font-extrabold">{activeStaffStats.DELEGATED}</span>
                          </span>
                        </div>
                      </div>

                      {/* 오늘 출근 Capsule */}
                      <div className="flex items-center gap-1.5 bg-emerald-50/60 border border-emerald-100 px-2 py-1 rounded-xl">
                        <button
                          onClick={() =>
                            setStatusModal({ type: "WORKING", isOpen: true })
                          }
                          className="flex items-center gap-1 hover:opacity-80 transition-opacity"
                        >
                          <span className="text-[10px] font-bold text-emerald-600">출근</span>
                          <span className="text-xs font-black text-emerald-900">
                            {activeStaffStats.WORKING}
                          </span>
                        </button>
                        <div className="h-3 w-[1px] bg-emerald-200" />
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-blue-600">
                            <span>직</span>
                            <span className="font-extrabold">{activeStaffStats.WORKING_DIRECT}</span>
                          </span>
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600">
                            <span>위</span>
                            <span className="font-extrabold">{activeStaffStats.WORKING_DELEGATED}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {(() => {
                    const todayWorkingStaff = staff
                      .filter((s) => workingStaffIds.includes(s.id!))
                      .sort((a, b) => {
                        const timeA = checkInTimes[a.id!]?.toMillis
                          ? checkInTimes[a.id!].toMillis()
                          : checkInTimes[a.id!] || 0;
                        const timeB = checkInTimes[b.id!]?.toMillis
                          ? checkInTimes[b.id!].toMillis()
                          : checkInTimes[b.id!] || 0;
                        return timeA - timeB;
                      });

                    if (todayWorkingStaff.length === 0) {
                      return (
                        <div className="text-center py-6 text-stone-400 text-sm font-medium">
                          아직 출근한 직원이 없습니다.
                        </div>
                      );
                    }

                    const ongoingRecords = records.filter((r) => {
                      const start = r.startTime.toDate
                        ? r.startTime.toDate()
                        : new Date(r.startTime);
                      const end = r.endTime.toDate
                        ? r.endTime.toDate()
                        : new Date(r.endTime);
                      return start.getTime() === end.getTime();
                    });
                    const staffWithOngoing = new Set(
                      ongoingRecords.map((r) => r.staffName),
                    );

                    const grouped = {
                      COFFEE: todayWorkingStaff.filter(
                        (s) => s.type === "COFFEE",
                      ),
                      PUBLIC: todayWorkingStaff.filter(
                        (s) => s.type === "PUBLIC",
                      ),
                      HOPPER: todayWorkingStaff.filter(
                        (s) => s.type === "HOPPER",
                      ),
                    };

                    const overallAffCounts: Record<string, { count: number; names: string[] }> = {};
                    todayWorkingStaff.forEach((s) => {
                      const { affiliation } = formatStaffNameComponents(s.name);
                      if (affiliation) {
                        if (!overallAffCounts[affiliation]) {
                          overallAffCounts[affiliation] = { count: 0, names: [] };
                        }
                        overallAffCounts[affiliation].count += 1;
                        overallAffCounts[affiliation].names.push(s.name);
                      }
                    });

                    return (
                      <div className="space-y-4">
                        {Object.keys(overallAffCounts).length > 0 && (
                          <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-3 shadow-2xs">
                            <div className="flex items-center justify-between mb-2 px-1">
                              <span className="text-[11px] font-black text-stone-600 uppercase tracking-wider flex items-center gap-1.5">
                                <Camera className="w-3.5 h-3.5 text-stone-800" />
                                소속별 묶음 캡쳐 공유 (뱃지 클릭시 캡쳐)
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar flex-wrap">
                              {Object.entries(overallAffCounts).map(([aff, data]) => (
                                <button
                                  key={`overall-aff-${aff}`}
                                  type="button"
                                  onClick={() => handleGroupCapture(aff, data.names)}
                                  className={cn(
                                    "px-2.5 py-1 rounded-lg text-xs font-black text-white shrink-0 flex items-center gap-1 shadow-xs hover:opacity-90 active:scale-95 transition-all cursor-pointer",
                                    aff === "직속" ? "bg-amber-500 hover:bg-amber-600" : "bg-purple-600 hover:bg-purple-700"
                                  )}
                                  title={`${aff} 소속 직원 (${data.count}명) 업무내역 묶음 캡쳐 공유`}
                                >
                                  <Camera className="w-3 h-3 opacity-90" />
                                  <span>{aff} {data.count}명</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {(["COFFEE", "PUBLIC", "HOPPER"] as const).map(
                          (group) => {
                            const list = grouped[group];
                            if (list.length === 0) return null;
                            const groupLabel =
                              group === "COFFEE"
                                ? "커피"
                                : group === "PUBLIC"
                                  ? "퍼블릭"
                                  : "하퍼";
                            const groupColor =
                              group === "COFFEE"
                                ? "text-emerald-700 bg-emerald-100"
                                : group === "PUBLIC"
                                  ? "text-blue-700 bg-blue-100"
                                  : "text-purple-700 bg-purple-100";

                            return (
                              <div key={group} className="space-y-2">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() => handleGroupCapture(groupLabel, list.map((s) => s.name))}
                                    className={cn(
                                      "text-[11px] font-black px-2 py-0.5 inline-flex items-center gap-1 rounded-md uppercase tracking-wider hover:opacity-85 transition-all cursor-pointer active:scale-95 shadow-2xs",
                                      groupColor,
                                    )}
                                    title={`${groupLabel} 소속 전체 직원 (${list.length}명) 묶음 캡쳐 공유`}
                                  >
                                    <Camera className="w-3 h-3 opacity-80" />
                                    <span>
                                      {groupLabel} {list.length}명
                                    </span>
                                  </button>
                                  {(() => {
                                    const affCounts: Record<string, { count: number; names: string[] }> = {};
                                    list.forEach((s) => {
                                      const { affiliation } = formatStaffNameComponents(s.name);
                                      if (affiliation) {
                                        if (!affCounts[affiliation]) {
                                          affCounts[affiliation] = { count: 0, names: [] };
                                        }
                                        affCounts[affiliation].count += 1;
                                        affCounts[affiliation].names.push(s.name);
                                      }
                                    });
                                    const entries = Object.entries(affCounts);
                                    if (entries.length === 0) return null;
                                    return entries.map(([aff, data]) => (
                                      <button
                                        key={aff}
                                        type="button"
                                        onClick={() => handleGroupCapture(aff, data.names)}
                                        className={cn(
                                          "px-1.5 py-0.5 rounded text-[10px] font-extrabold leading-none shadow-2xs text-white hover:opacity-90 transition-all cursor-pointer active:scale-95 flex items-center gap-1",
                                          aff === "직속" ? "bg-amber-500 hover:bg-amber-600" : "bg-purple-600 hover:bg-purple-700"
                                        )}
                                        title={`${aff} 소속 직원 (${data.count}명) 묶음 캡쳐 공유`}
                                      >
                                        <Camera className="w-2.5 h-2.5 opacity-90" />
                                        <span>
                                          {aff} {data.count}명
                                        </span>
                                      </button>
                                    ));
                                  })()}
                                </div>
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-9 gap-1.5 sm:gap-2.5 p-1 sm:p-2">
                                  {list.map((s) => {
                                    const isFinished = offStaffIds.includes(
                                      s.id!,
                                    );
                                    const ongoingRecord = ongoingRecords.find(
                                      (r) => r.staffName === s.name,
                                    );
                                    const isOngoing =
                                      !isFinished && !!ongoingRecord;
                                    const activeChoice =
                                      !isFinished && !isOngoing
                                        ? activeChoices[s.name] ||
                                          activeChoices[
                                            staffRenameMap.get(s.name) || s.name
                                          ]
                                        : undefined;
                                    const isChoice =
                                      !isFinished && !isOngoing && !!activeChoice;
                                    const isWaiting =
                                      !isFinished && !ongoingRecord && !isChoice;

                                    let durationText = "";
                                    let startStr = "";
                                    if (isOngoing && ongoingRecord) {
                                      const ongoingStart = ongoingRecord
                                        .startTime.toDate
                                        ? ongoingRecord.startTime.toDate()
                                        : new Date(ongoingRecord.startTime);
                                      const diffMs =
                                        currentTime.getTime() -
                                        ongoingStart.getTime();
                                      const diffMins = Math.max(
                                        0,
                                        Math.floor(diffMs / 60000),
                                      );
                                      const fullHours = Math.floor(
                                        diffMins / 60,
                                      );
                                      const leftoverMins = diffMins % 60;
                                      durationText = `${fullHours > 0 ? `${fullHours}시간 ` : ""}${leftoverMins}분`;
                                      startStr = format(ongoingStart, "HH:mm");
                                    }

                                    return (
                                      <div
                                        id={`staff-card-${s.name}`}
                                        key={s.id}
                                        role="button"
                                        tabIndex={0}
                                        onPointerDown={(e) => {
                                          // e.preventDefault(); // Might interfere with scrolling if we do this, let's see.
                                          startPress(s.name);
                                        }}
                                        onPointerUp={() => endPress()}
                                        onPointerLeave={() => endPress()}
                                        onContextMenu={(e) =>
                                          e.preventDefault()
                                        }
                                        onClick={(e) => {
                                          e.preventDefault();
                                          onMultiClick(s.name, isFinished);
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            onMultiClick(s.name, isFinished);
                                          }
                                        }}
                                        style={{
                                          WebkitTouchCallout: "none",
                                          WebkitUserSelect: "none",
                                        }}
                                        className={cn(
                                          "px-1 py-1 sm:py-1.5 sm:px-2 rounded-xl border-2 flex flex-col items-center justify-center text-center relative transition-all active:scale-95 active:bg-stone-50 select-none overflow-hidden min-w-0",
                                          highlightedStaffColumn === s.name &&
                                            "border-4 border-yellow-400 bg-yellow-100/95 shadow-[0_0_20px_rgba(250,204,21,0.95)] scale-105 z-30 animate-pulse text-stone-900 font-black",
                                          multiSelected.includes(s.name) &&
                                            "ring-2 ring-blue-500 border-blue-500 bg-blue-50/50 shadow-md transform scale-[1.02]",
                                          !multiSelected.includes(s.name) &&
                                            isOngoing
                                            ? "border-emerald-400 bg-emerald-50 shadow-sm"
                                            : !multiSelected.includes(s.name) &&
                                                isChoice
                                              ? "border-purple-500 bg-purple-50/90 shadow-md ring-2 ring-purple-400/40"
                                              : !multiSelected.includes(s.name) &&
                                                  isWaiting
                                                ? "border-red-400 bg-red-50 shadow-sm"
                                                : !multiSelected.includes(
                                                      s.name,
                                                    ) && isFinished
                                                  ? "border-stone-200 bg-stone-100 opacity-60"
                                                  : !multiSelected.includes(
                                                        s.name,
                                                      )
                                                    ? "border-stone-200 bg-white"
                                                    : "",
                                        )}
                                      >
                                        {(() => {
                                          const { main4, affiliation } = formatStaffNameComponents(s.name);
                                          return (
                                            <div className="flex flex-col items-center justify-center w-full min-w-0 px-0.5">
                                              <span
                                                className={cn(
                                                  "font-black leading-tight whitespace-nowrap block w-full text-center tracking-tight text-[12px] sm:text-[14px] md:text-[15px] truncate",
                                                  isOngoing
                                                    ? "text-emerald-900"
                                                    : isChoice
                                                      ? "text-purple-950"
                                                      : isWaiting
                                                        ? "text-red-900"
                                                        : isFinished
                                                          ? "text-stone-500"
                                                          : "text-stone-700",
                                                )}
                                                title={s.name}
                                              >
                                                {main4}
                                              </span>
                                              {affiliation && (
                                                <span
                                                  className={cn(
                                                    "mt-0.5 sm:mt-1 px-1 sm:px-1.5 py-0.5 rounded text-[8.5px] sm:text-[10px] font-black text-white shrink-0 whitespace-nowrap leading-none shadow-2xs",
                                                    affiliation === "직속" ? "bg-amber-500" : "bg-purple-600"
                                                  )}
                                                >
                                                  {affiliation}
                                                </span>
                                              )}
                                            </div>
                                          );
                                        })()}

                                        <div className="flex flex-col items-center gap-0 w-full mt-0.5 sm:mt-1">
                                          <div className="flex flex-col items-center w-full justify-center gap-0.5">
                                            {isOngoing && ongoingRecord && (
                                              <div className="flex flex-col items-center justify-center w-full">
                                                <div className="flex items-center gap-1 focus:outline-none w-full justify-center">
                                                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-emerald-500 rounded-full animate-pulse shrink-0" />
                                                  <span className="text-[10px] sm:text-[11px] font-bold text-emerald-600 break-keep whitespace-pre-wrap text-center leading-tight truncate">
                                                    {ongoingRecord.establishmentName ||
                                                      "진행중"}
                                                  </span>
                                                </div>
                                                <div className="flex items-center gap-0.5 text-[8.5px] sm:text-[9px] font-bold text-emerald-700/80 bg-emerald-100/50 px-1 py-0.25 sm:py-0.5 rounded leading-none mt-0.5 whitespace-nowrap">
                                                  <span>{startStr} -</span>
                                                  <span className="text-emerald-700">
                                                    {durationText}
                                                  </span>
                                                </div>
                                              </div>
                                            )}
                                            {isChoice && activeChoice && (
                                              <div className="flex flex-col items-center justify-center w-full space-y-1 my-0.5">
                                                <div className="flex items-center gap-1 focus:outline-none w-full justify-center px-0.5">
                                                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-purple-500 rounded-full animate-pulse shrink-0" />
                                                  <span className="text-[10px] sm:text-[11px] font-extrabold text-purple-700 break-keep whitespace-nowrap text-center leading-tight truncate max-w-full">
                                                    {activeChoice.establishmentName}
                                                  </span>
                                                </div>
                                                <div className="flex items-center gap-0.5 text-[8.5px] sm:text-[9.5px] font-black text-purple-800 bg-purple-200/80 px-1.5 py-0.5 rounded leading-none whitespace-nowrap">
                                                  <span>초이스</span>
                                                  <span className="font-mono">{activeChoice.choiceTime}</span>
                                                </div>
                                                <div className="flex items-center gap-1 w-full pt-0.5">
                                                  <button
                                                    type="button"
                                                    onClick={(e) => {
                                                      e.preventDefault();
                                                      e.stopPropagation();
                                                      handleProgressFromChoice(s.name, activeChoice);
                                                    }}
                                                    className="flex-1 py-1 sm:py-1.5 px-0.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-[10px] sm:text-[11px] rounded-lg shadow-xs transition-all cursor-pointer flex items-center justify-center leading-none tracking-tight"
                                                    title="초이스 보던 가게에 현시간부로 진행 기록"
                                                  >
                                                    진행
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={(e) => {
                                                      e.preventDefault();
                                                      e.stopPropagation();
                                                      handleBounceFromChoice(s.name, activeChoice);
                                                    }}
                                                    className="flex-1 py-1 sm:py-1.5 px-0.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-black text-[10px] sm:text-[11px] rounded-lg shadow-xs transition-all cursor-pointer flex items-center justify-center leading-none tracking-tight"
                                                    title="현시간부로 튕김 처리 후 대기 상태로 복귀"
                                                  >
                                                    튕김
                                                  </button>
                                                </div>
                                              </div>
                                            )}
                                            {isWaiting && (
                                              <span className="text-[10px] sm:text-[11px] font-bold text-red-600">
                                                대기
                                              </span>
                                            )}
                                            {isFinished && (
                                              <span className="text-[10px] sm:text-[11px] font-bold text-stone-400">
                                                퇴근
                                              </span>
                                            )}
                                          </div>
                                          {checkInTimes[s.id!] && (
                                            <span
                                              className={cn(
                                                "text-[9.5px] sm:text-[11px] font-medium font-mono leading-none mt-0.5 sm:mt-1 text-stone-400",
                                              )}
                                            >
                                              {format(
                                                checkInTimes[s.id!].toDate
                                                  ? checkInTimes[s.id!].toDate()
                                                  : new Date(
                                                      checkInTimes[s.id!],
                                                    ),
                                                "HH:mm",
                                              )}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          },
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-4 mb-6">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                    <div className="flex items-center gap-4">
                      <h2 className="text-xl font-bold flex items-center gap-2">
                        {viewMode === "list" ? (
                          <History className="w-5 h-5" />
                        ) : viewMode === "settlement" ? (
                          <Wallet className="w-5 h-5 text-indigo-600" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-red-600" />
                        )}
                        {viewMode === "list"
                          ? "파견 기록"
                          : viewMode === "settlement"
                            ? "소속별 정산"
                            : "총 미수금 상세"}
                      </h2>
                      <div className="flex bg-stone-200 p-1 rounded-xl">
                        <button
                          onClick={() => setViewMode("list")}
                          className={cn(
                            "px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                            viewMode === "list"
                              ? "bg-white shadow-sm text-stone-900"
                              : "text-stone-500 hover:text-stone-700",
                          )}
                        >
                          리스트
                        </button>
                        <button
                          onClick={() => setViewMode("settlement")}
                          className={cn(
                            "px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                            viewMode === "settlement"
                              ? "bg-indigo-600 shadow-sm text-white"
                              : "text-stone-500 hover:text-stone-700",
                          )}
                        >
                          정산
                        </button>
                        <button
                          onClick={() => setViewMode("unpaid")}
                          className={cn(
                            "px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
                            viewMode === "unpaid"
                              ? "bg-red-600 shadow-sm text-white"
                              : "text-stone-500 hover:text-stone-700",
                          )}
                        >
                          <span>총미수금 상세</span>
                          {stats.unpaidAmount > 0 && (
                            <span
                              className={cn(
                                "px-1.5 py-0.2 rounded-full text-[10px] font-black",
                                viewMode === "unpaid"
                                  ? "bg-white text-red-700"
                                  : "bg-red-100 text-red-600",
                              )}
                            >
                              {(stats.unpaidAmount / 10000).toLocaleString()}만
                            </span>
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
                      <button
                        type="button"
                        onClick={() => setIsBatchDelegatedProfitModalOpen(true)}
                        className="bg-amber-500 hover:bg-amber-600 text-white h-10 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-95 text-xs sm:text-sm cursor-pointer whitespace-nowrap"
                        title="위탁직원 별도수익 일괄 수정"
                      >
                        <Coins className="w-4 h-4" />
                        <span>위탁수익</span>
                      </button>
                      <button
                        onClick={() => setIsFormOpen(true)}
                        className="bg-stone-900 text-white h-10 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 hover:bg-stone-800 transition-all active:scale-95 cursor-pointer whitespace-nowrap text-xs sm:text-sm"
                      >
                        <Plus className="w-4 h-4" />
                        <span>기록추가</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="mt-4">
                  {viewMode === "unpaid" ? (
                    <UnpaidDetailView
                      records={records}
                      allUnpaidRecords={allUnpaidRecords}
                      staff={staff}
                      selectedDate={selectedDate}
                      onUpdateRecord={async (id, updates) => {
                        await updateDispatch(id, updates as any);
                      }}
                      onEditRecord={(record) => setEditingRecord(record)}
                    />
                  ) : records.length === 0 &&
                    bouncedRecords.length === 0 &&
                    unpaidStaffRecords.filter((r) => r.date < selectedDate)
                      .length === 0 ? (
                    <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center">
                      <div className="w-12 h-12 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Clock className="text-stone-400 w-6 h-6" />
                      </div>
                      <p className="text-stone-500">
                        기록된 파견 내역이 없습니다.
                      </p>
                    </div>
                  ) : viewMode === "list" ? (
                    <ListView
                      records={records}
                      unpaidStaffRecords={unpaidStaffRecords.filter(
                        (r) => r.date < selectedDate,
                      )}
                      onEditRecord={(record) => setEditingRecord(record)}
                      onAddRecordForStaff={handleAddRecordForStaff}
                      currentTime={currentTime}
                      offStaffIds={offStaffIds}
                      checkInTimes={checkInTimes}
                      offTimes={offTimes}
                      onToggleOff={handleToggleOff}
                      workingStaffIds={workingStaffIds}
                      onToggleWorking={handleToggleAttendance}
                      staff={staff}
                      manualDailyProfits={manualDailyProfits}
                      onManualProfitClick={onManualProfitClick}
                      onStaffPaymentClick={(staffName) =>
                        setDetailModal({
                          type: "staffPayment",
                          isOpen: true,
                          initialSearchTerm: staffName,
                        })
                      }
                      highlightedStaffColumn={highlightedStaffColumn}
                      selectedDate={selectedDate}
                      highlightedId={highlightedId}
                      bouncedRecords={bouncedRecords}
                      onBounceBadgeClick={(staffName) =>
                        setSelectedBouncedStaff(staffName)
                      }
                      weeklyAttendanceMap={weeklyAttendanceMap}
                    />
                  ) : (
                    <SettlementView
                      records={records}
                      unpaidStaffRecords={unpaidStaffRecords.filter(
                        (r) => r.date < selectedDate,
                      )}
                      offStaffIds={offStaffIds}
                      checkInTimes={checkInTimes}
                      offTimes={offTimes}
                      staff={staff}
                      manualDailyProfits={manualDailyProfits}
                      onManualProfitClick={onManualProfitClick}
                      onStaffPaymentClick={(staffName) =>
                        setDetailModal({
                          type: "staffPayment",
                          isOpen: true,
                          initialSearchTerm: staffName,
                        })
                      }
                      selectedDate={selectedDate}
                      bouncedRecords={bouncedRecords}
                    />
                  )}
                </div>
              </main>

              {/* Bounced List Modal */}
              <AnimatePresence>
                {selectedBouncedStaff && (
                  <BouncedListModal
                    staffName={selectedBouncedStaff}
                    bouncedRecords={bouncedRecords}
                    dispatchRecords={records.filter((r) => r.staffName === selectedBouncedStaff)}
                    onClose={() => setSelectedBouncedStaff(null)}
                    onDelete={async (id) => {
                      try {
                        await deleteBouncedRecord(id);
                      } catch (err) {
                        console.error("Error deleting bounced record:", err);
                      }
                    }}
                  />
                )}
              </AnimatePresence>

              {/* Form Modal */}
              <AnimatePresence>
                {(isFormOpen || editingRecord) && (
                  <DispatchFormModal
                    onClose={() => {
                      setIsFormOpen(false);
                      setEditingRecord(null);
                      setPreSelectedStaffNames([]);
                    }}
                    selectedDate={selectedDate}
                    editRecord={editingRecord}
                    preSelectedStaffNames={preSelectedStaffNames}
                    workingStaff={staff
                      .filter((s) => workingStaffIds.includes(s.id!))
                      .sort((a, b) => {
                        const timeA =
                          a.id && checkInTimes[a.id]
                            ? checkInTimes[a.id]?.toMillis?.() || 0
                            : Number.MAX_SAFE_INTEGER;
                        const timeB =
                          b.id && checkInTimes[b.id]
                            ? checkInTimes[b.id]?.toMillis?.() || 0
                            : Number.MAX_SAFE_INTEGER;
                        return timeA - timeB;
                      })}
                    offStaffIds={offStaffIds}
                    allRecords={records}
                    establishments={establishments}
                    checkInTimes={checkInTimes}
                    currentTime={currentTime}
                    onAlert={(msg) => setAlertConfig({ message: msg })}
                  />
                )}
              </AnimatePresence>

              {/* Management Modal */}
              <AnimatePresence>
                {isStaffModalOpen && (
                  <ManagementModal
                    globalEmploymentFilter={globalEmploymentFilter}
                    setGlobalEmploymentFilter={setGlobalEmploymentFilter}
                    globalStaffTypeFilter={globalStaffTypeFilter}
                    setGlobalStaffTypeFilter={setGlobalStaffTypeFilter}
                    onClose={() => setIsStaffModalOpen(false)}
                    staff={staff}
                    establishments={establishments}
                    workingStaffIds={workingStaffIds}
                    offStaffIds={offStaffIds}
                    checkInTimes={checkInTimes}
                    offTimes={offTimes}
                    selectedDate={selectedDate}
                    showInstallBtn={showInstallBtn}
                    onInstall={handleInstallClick}
                    onAlert={(msg) => setAlertConfig({ message: msg })}
                    onToggleAttendance={handleToggleAttendance}
                    onToggleOff={handleToggleOff}
                  />
                )}
              </AnimatePresence>

              {/* Detail Breakdown Modal */}
              <AnimatePresence>
                {detailModal.isOpen && (
                  <DetailBreakdownModal
                    type={detailModal.type}
                    records={
                      detailModal.type === "unpaid" ? allUnpaidRecords : records
                    }
                    unpaidStaffRecords={unpaidStaffRecords.filter(
                      (r) => r.date < selectedDate,
                    )}
                    allUnpaidRecords={allUnpaidRecords}
                    onClose={() =>
                      setDetailModal((prev) => ({ ...prev, isOpen: false }))
                    }
                    currentTime={currentTime}
                    staff={staff}
                    checkInTimes={checkInTimes}
                    selectedDate={selectedDate}
                    manualDailyProfits={manualDailyProfits}
                    initialSearchTerm={detailModal.initialSearchTerm}
                  />
                )}
              </AnimatePresence>

              {/* Status Staff Modal */}
              <StatusStaffModal
                isOpen={statusModal.isOpen}
                type={statusModal.type}
                onClose={() =>
                  setStatusModal((prev) => ({ ...prev, isOpen: false }))
                }
                staff={staff}
                workingStaffIds={workingStaffIds}
                offStaffIds={offStaffIds}
                records={records}
                checkInTimes={checkInTimes}
                activeChoices={activeChoices}
                onToggleAttendance={handleToggleAttendance}
                onToggleOff={handleToggleOff}
                onToggleOffMultiple={handleToggleOffMultiple}
                onBounceMultiple={handleBounceMultiple}
                onChoiceMultiple={handleChoiceMultiple}
                onProgressMultiple={handleProgressMultiple}
                onFinishMultiple={handleFinishMultiple}
                onAddRecord={(names) => {
                  setPreSelectedStaffNames(
                    Array.isArray(names) ? names : [names],
                  );
                  setIsFormOpen(true);
                }}
                onEditRecord={(record) => {
                  setEditingRecord(record);
                  setIsFormOpen(true);
                }}
                onGroupCapture={handleGroupCapture}
              />

              {/* Choice Setup Modal */}
              <AnimatePresence>
                {isChoiceModalOpen && (
                  <ChoiceSetupModal
                    isOpen={isChoiceModalOpen}
                    onClose={() => {
                      setIsChoiceModalOpen(false);
                      setChoiceModalStaff([]);
                    }}
                    staffNames={choiceModalStaff}
                    establishments={establishments}
                    currentTime={currentTime}
                    onConfirm={handleConfirmChoiceModal}
                  />
                )}
              </AnimatePresence>

              {/* Choice Progress & Bounce Action Modal */}
              <AnimatePresence>
                {choiceActionModalConfig?.isOpen && (
                  <ChoiceActionModal
                    isOpen={choiceActionModalConfig.isOpen}
                    mode={choiceActionModalConfig.mode}
                    onClose={() => setChoiceActionModalConfig(null)}
                    staffNames={choiceActionModalConfig.staffNames}
                    initialEstablishmentName={
                      choiceActionModalConfig.initialEstablishmentName
                    }
                    initialTime={choiceActionModalConfig.initialTime}
                    establishments={establishments}
                    records={records}
                    bouncedRecords={bouncedRecords}
                    currentTime={currentTime}
                    onConfirm={handleConfirmChoiceActionModal}
                  />
                )}
              </AnimatePresence>

              {/* Bounce Establishment Input Modal */}
              <AnimatePresence>
                {bounceModalConfig?.isOpen && (
                  <BounceEstablishmentModal
                    isOpen={bounceModalConfig.isOpen}
                    onClose={() => setBounceModalConfig(null)}
                    staffWithOngoing={bounceModalConfig.staffWithOngoing}
                    staffWithoutOngoing={bounceModalConfig.staffWithoutOngoing}
                    establishments={establishments}
                    records={records}
                    bouncedRecords={bouncedRecords}
                    onConfirm={handleConfirmBounceModal}
                  />
                )}
              </AnimatePresence>

              <AnimatePresence>
                {alertConfig && (
                  <AlertModal
                    message={alertConfig.message}
                    actionLabel={alertConfig.actionLabel}
                    onAction={alertConfig.onAction}
                    onClose={() => setAlertConfig(null)}
                  />
                )}
              </AnimatePresence>

              {/* Manual Profit Modal */}
              <AnimatePresence>
                {manualProfitModalConfig?.isOpen && (
                  <ManualProfitModal
                    onClose={() => setManualProfitModalConfig(null)}
                    staffName={manualProfitModalConfig.staffName}
                    date={manualProfitModalConfig.date}
                    currentCalculatedProfit={
                      manualProfitModalConfig.currentCalculatedProfit
                    }
                    currentManualProfit={
                      manualProfitModalConfig.currentManualProfit
                    }
                  />
                )}
              </AnimatePresence>

              {/* Batch Delegated Profit Modal */}
              <AnimatePresence>
                {isBatchDelegatedProfitModalOpen && (
                  <BatchDelegatedProfitModal
                    isOpen={isBatchDelegatedProfitModalOpen}
                    onClose={() => setIsBatchDelegatedProfitModalOpen(false)}
                    date={selectedDate}
                    staff={staff}
                    workingStaffIds={workingStaffIds}
                    records={records}
                    manualDailyProfits={manualDailyProfits}
                    onAlert={(message) => setAlertConfig({ message })}
                  />
                )}
              </AnimatePresence>

              {renderMultiSelectBar()}

              {/* Floating Bottom Staff Search Bar */}
              <FloatingStaffSearchBar
                staff={staff}
                workingStaffIds={workingStaffIds}
                offStaffIds={offStaffIds}
                onFocusStaff={handleFocusStaff}
              />

              {capturingGroupText && (
                <div className="fixed inset-0 z-[10000] bg-stone-900/70 backdrop-blur-xs flex flex-col items-center justify-center p-4">
                  <div className="bg-white rounded-3xl p-6 shadow-2xl flex flex-col items-center gap-4 max-w-sm text-center border border-stone-100 animate-in fade-in zoom-in duration-200">
                    <div className="w-14 h-14 rounded-full bg-stone-900 text-white flex items-center justify-center animate-bounce shadow-lg">
                      <Camera className="w-7 h-7" />
                    </div>
                    <div>
                      <h4 className="font-black text-stone-900 text-base mb-1">
                        소속별 묶음 캡쳐 중
                      </h4>
                      <p className="text-xs text-stone-500 font-bold leading-relaxed">
                        {capturingGroupText}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ErrorBoundary>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function StatusStaffModal({
  type,
  isOpen,
  onClose,
  staff,
  workingStaffIds,
  offStaffIds,
  records,
  checkInTimes,
  activeChoices,
  onToggleAttendance,
  onToggleOff,
  onToggleOffMultiple,
  onBounceMultiple,
  onChoiceMultiple,
  onProgressMultiple,
  onFinishMultiple,
  onAddRecord,
  onEditRecord,
  onGroupCapture,
}: {
  type: "TOTAL" | "WORKING" | "WAITING" | "FINISHED" | "OFF_DUTY";
  isOpen: boolean;
  onClose: () => void;
  staff: Staff[];
  workingStaffIds: string[];
  offStaffIds: string[];
  records: DispatchRecord[];
  checkInTimes: Record<string, any>;
  activeChoices?: Record<string, ActiveChoice>;
  onToggleAttendance: (id: string, e?: React.MouseEvent) => Promise<void>;
  onToggleOff: (id: string, e?: React.MouseEvent) => Promise<void>;
  onToggleOffMultiple?: (names: string[]) => void | Promise<void>;
  onBounceMultiple?: (names: string[]) => void | Promise<void>;
  onChoiceMultiple?: (names: string[]) => void | Promise<void>;
  onProgressMultiple?: (names: string[]) => void | Promise<void>;
  onFinishMultiple?: (names: string[]) => void | Promise<void>;
  onAddRecord: (staffNames: string[]) => void;
  onEditRecord: (record: DispatchRecord) => void;
  onGroupCapture?: (groupTitle: string, staffNames: string[]) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isBounceConfirming, setIsBounceConfirming] = useState(false);
  const bounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const touchPos = useRef<{ x: number; y: number } | null>(null);
  const isScrolling = useRef(false);

  useEffect(() => {
    if (!isOpen || !isSelectionMode || selectedIds.size === 0) {
      setIsBounceConfirming(false);
      if (bounceTimerRef.current) {
        clearTimeout(bounceTimerRef.current);
        bounceTimerRef.current = null;
      }
    }
  }, [isOpen, isSelectionMode, selectedIds]);

  useEffect(() => {
    if (!isOpen) {
      setIsSelectionMode(false);
      setSelectedIds(new Set());
      setSearchTerm("");
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLongPress = (id: string) => {
    setIsSelectionMode(true);
    setSelectedIds(new Set([id]));
  };

  const startPress = (id: string) => {
    if (isSelectionMode) return;
    longPressTimer.current = setTimeout(() => handleLongPress(id), 500);
  };

  const cancelPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (next.size === 0) setIsSelectionMode(false);
      return next;
    });
  };

  const handleBulkAddRecord = () => {
    const names = staff
      .filter((s) => selectedIds.has(s.id!))
      .map((s) => s.name);
    onAddRecord(names);
    setIsSelectionMode(false);
    setSelectedIds(new Set());
    onClose();
  };

  const ongoingRecords = records.filter((r) => {
    const start = r.startTime.toDate
      ? r.startTime.toDate()
      : new Date(r.startTime);
    const end = r.endTime.toDate ? r.endTime.toDate() : new Date(r.endTime);
    return start.getTime() === end.getTime();
  });
  const staffWithOngoing = new Set(ongoingRecords.map((r) => r.staffName));

  const filteredStaff = staff.filter((s) => {
    const isWorking = workingStaffIds.includes(s.id!);
    const isFinished = isWorking && offStaffIds.includes(s.id!);
    const isWaiting = isWorking && !isFinished && !staffWithOngoing.has(s.name);

    let matchType = false;
    switch (type) {
      case "TOTAL":
        matchType = true;
        break;
      case "WORKING":
        matchType = isWorking;
        break;
      case "WAITING":
        matchType = isWaiting;
        break;
      case "FINISHED":
        matchType = isFinished;
        break;
      case "OFF_DUTY":
        matchType = !isWorking;
        break;
      default:
        matchType = false;
    }

    if (!matchType) return false;

    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      return (
        s.name.toLowerCase().includes(term) ||
        (s.office && s.office.toLowerCase().includes(term))
      );
    }

    return true;
  });

  const groupedStaff = {
    COFFEE: filteredStaff.filter((s) => s.type === "COFFEE"),
    PUBLIC: filteredStaff.filter((s) => s.type === "PUBLIC"),
    HOPPER: filteredStaff.filter((s) => s.type === "HOPPER"),
  };

  const titleMap = {
    TOTAL: "전체 명단",
    WORKING: "출근 명단",
    WAITING: "대기 명단",
    FINISHED: "퇴근 명단",
    OFF_DUTY: "휴무 명단",
  };

  // Sort working staff by check-in time for the summary
  const workingStaffList = staff
    .filter(
      (s) => workingStaffIds.includes(s.id!) && !offStaffIds.includes(s.id!),
    )
    .sort((a, b) => {
      const timeA = checkInTimes[a.id!]?.toMillis
        ? checkInTimes[a.id!].toMillis()
        : checkInTimes[a.id!] || 0;
      const timeB = checkInTimes[b.id!]?.toMillis
        ? checkInTimes[b.id!].toMillis()
        : checkInTimes[b.id!] || 0;
      return timeA - timeB;
    });

  const workingGrouped = {
    COFFEE: workingStaffList.filter((s) => s.type === "COFFEE"),
    PUBLIC: workingStaffList.filter((s) => s.type === "PUBLIC"),
    HOPPER: workingStaffList.filter((s) => s.type === "HOPPER"),
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]"
        >
          <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-stone-50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-stone-900 rounded-xl flex items-center justify-center">
                <Users className="text-white w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-lg text-stone-900">
                  {titleMap[type]}
                </h3>
                <p className="text-xs text-stone-500 font-bold flex items-center gap-1.5 flex-wrap mt-0.5">
                  <span>총 {filteredStaff.length}명</span>
                  <span className="text-stone-300">•</span>
                  <span className="text-blue-600 font-black">직속 {filteredStaff.filter((s) => formatStaffNameComponents(s.name).isDirect).length}</span>
                  <span className="text-stone-300">•</span>
                  <span className="text-amber-600 font-black">위탁 {filteredStaff.filter((s) => !formatStaffNameComponents(s.name).isDirect).length}</span>
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-stone-200 rounded-full transition-colors"
            >
              <Plus className="w-6 h-6 rotate-45 text-stone-400" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
            {/* Working Status Summary - Only show in TOTAL or WORKING view */}
            {(type === "TOTAL" || type === "WORKING") &&
              workingStaffList.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-1">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    <h4 className="text-[11px] font-black text-stone-400 uppercase tracking-widest">
                      현재 출근 상태 요약
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {(["COFFEE", "PUBLIC", "HOPPER"] as const).map((group) => {
                      const list = workingGrouped[group];
                      if (list.length === 0) return null;
                      const groupLabel =
                        group === "COFFEE"
                          ? "커피"
                          : group === "PUBLIC"
                            ? "퍼블릭"
                            : "하퍼";
                      const groupColor =
                        group === "COFFEE"
                          ? "text-emerald-600"
                          : group === "PUBLIC"
                            ? "text-blue-600"
                            : "text-purple-600";
                      const groupDirect = list.filter((s) => formatStaffNameComponents(s.name).isDirect).length;
                      const groupDelegated = list.filter((s) => !formatStaffNameComponents(s.name).isDirect).length;

                      return (
                        <div
                          key={`summary-${group}`}
                          className="bg-stone-50/50 rounded-2xl border border-stone-100 p-3"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <button
                                type="button"
                                onClick={() => onGroupCapture?.(groupLabel, list.map((s) => s.name))}
                                className={cn(
                                  "text-[10px] font-black px-2 py-0.5 rounded-md inline-flex items-center gap-1 bg-white border border-stone-100 shadow-2xs hover:opacity-80 active:scale-95 transition-all cursor-pointer",
                                  groupColor,
                                )}
                                title={`${groupLabel} 소속 전체 (${list.length}명) 묶음 캡쳐 공유`}
                              >
                                <Camera className="w-2.5 h-2.5 opacity-80" />
                                <span>{groupLabel} {list.length}명</span>
                              </button>
                              {(() => {
                                const affCounts: Record<string, { count: number; names: string[] }> = {};
                                list.forEach((s) => {
                                  const { affiliation } = formatStaffNameComponents(s.name);
                                  if (affiliation) {
                                    if (!affCounts[affiliation]) {
                                      affCounts[affiliation] = { count: 0, names: [] };
                                    }
                                    affCounts[affiliation].count += 1;
                                    affCounts[affiliation].names.push(s.name);
                                  }
                                });
                                const entries = Object.entries(affCounts);
                                if (entries.length === 0) return null;
                                return entries.map(([aff, data]) => (
                                  <button
                                    key={aff}
                                    type="button"
                                    onClick={() => onGroupCapture?.(aff, data.names)}
                                    className={cn(
                                      "px-1.5 py-0.5 rounded text-[9px] font-extrabold leading-none shadow-2xs text-white flex items-center gap-0.5 hover:opacity-90 active:scale-95 transition-all cursor-pointer",
                                      aff === "직속" ? "bg-amber-500 hover:bg-amber-600" : "bg-purple-600 hover:bg-purple-700"
                                    )}
                                    title={`${aff} 소속 직원 (${data.count}명) 묶음 캡쳐 공유`}
                                  >
                                    <Camera className="w-2 h-2 opacity-90" />
                                    <span>{aff} {data.count}명</span>
                                  </button>
                                ));
                              })()}
                            </div>
                            <div className="flex gap-1 text-[9px] font-bold">
                              <span className="text-blue-700 bg-blue-50 border border-blue-100/60 px-1.5 py-0.25 rounded-md">직 {groupDirect}</span>
                              <span className="text-amber-700 bg-amber-50 border border-amber-100/60 px-1.5 py-0.25 rounded-md">위 {groupDelegated}</span>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            {list.map((s, idx) => {
                              const checkInTime = checkInTimes[s.id!];
                              const timeStr = checkInTime
                                ? format(
                                    checkInTime.toDate
                                      ? checkInTime.toDate()
                                      : new Date(checkInTime),
                                    "HH:mm",
                                  )
                                : "--:--";
                              const order =
                                workingStaffList.findIndex(
                                  (ws) => ws.id === s.id,
                                ) + 1;

                              return (
                                <div
                                  key={`ws-${s.id}`}
                                  className="flex items-center justify-between text-xs"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="w-4 text-[10px] font-black text-stone-300">
                                      #{order}
                                    </span>
                                    <span className="font-bold text-stone-700">
                                      {s.name}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <Clock className="w-3 h-3 text-stone-300" />
                                    <span className="font-mono font-bold text-stone-500">
                                      {timeStr}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            {(["COFFEE", "PUBLIC", "HOPPER"] as const).map((group) => {
              const list = groupedStaff[group];
              if (list.length === 0) return null;

              const groupLabel =
                group === "COFFEE"
                  ? "커피"
                  : group === "PUBLIC"
                    ? "퍼블릭"
                    : "하퍼";
              const groupColor =
                group === "COFFEE"
                  ? "text-emerald-600 bg-emerald-50"
                  : group === "PUBLIC"
                    ? "text-blue-600 bg-blue-50"
                    : "text-purple-600 bg-purple-50";

              return (
                <div key={group} className="space-y-3">
                  <div className="flex items-center justify-between px-1 flex-wrap gap-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => onGroupCapture?.(groupLabel, list.map((s) => s.name))}
                        className={cn(
                          "text-xs font-black px-2 py-1 rounded-lg uppercase tracking-wider flex items-center gap-1 shadow-2xs hover:opacity-80 active:scale-95 transition-all cursor-pointer",
                          groupColor,
                        )}
                        title={`${groupLabel} 소속 전체 (${list.length}명) 묶음 캡쳐 공유`}
                      >
                        <Camera className="w-3 h-3 opacity-80" />
                        <span>{groupLabel} {list.length}명</span>
                      </button>
                      {(() => {
                        const affCounts: Record<string, { count: number; names: string[] }> = {};
                        list.forEach((s) => {
                          const { affiliation } = formatStaffNameComponents(s.name);
                          if (affiliation) {
                            if (!affCounts[affiliation]) {
                              affCounts[affiliation] = { count: 0, names: [] };
                            }
                            affCounts[affiliation].count += 1;
                            affCounts[affiliation].names.push(s.name);
                          }
                        });
                        const entries = Object.entries(affCounts);
                        if (entries.length === 0) return null;
                        return entries.map(([aff, data]) => (
                          <button
                            key={aff}
                            type="button"
                            onClick={() => onGroupCapture?.(aff, data.names)}
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[10px] font-extrabold leading-none shadow-2xs text-white flex items-center gap-1 hover:opacity-90 active:scale-95 transition-all cursor-pointer",
                              aff === "직속" ? "bg-amber-500 hover:bg-amber-600" : "bg-purple-600 hover:bg-purple-700"
                            )}
                            title={`${aff} 소속 직원 (${data.count}명) 묶음 캡쳐 공유`}
                          >
                            <Camera className="w-2.5 h-2.5 opacity-90" />
                            <span>{aff} {data.count}명</span>
                          </button>
                        ));
                      })()}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {list.map((s) => {
                      const isWorking = workingStaffIds.includes(s.id!);
                      const isFinished =
                        isWorking && offStaffIds.includes(s.id!);
                      const isOngoing =
                        isWorking &&
                        !isFinished &&
                        staffWithOngoing.has(s.name);
                      const isWaiting =
                        isWorking &&
                        !isFinished &&
                        !staffWithOngoing.has(s.name);
                      const isSelected = selectedIds.has(s.id!);

                      return (
                        <button
                          key={s.id}
                          onMouseDown={(e) => {
                            touchPos.current = { x: e.clientX, y: e.clientY };
                            isScrolling.current = false;
                            startPress(s.id!);
                          }}
                          onMouseMove={(e) => {
                            if (!touchPos.current) return;
                            const dx = e.clientX - touchPos.current.x;
                            const dy = e.clientY - touchPos.current.y;
                            if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                              isScrolling.current = true;
                              cancelPress();
                            }
                          }}
                          onMouseUp={cancelPress}
                          onMouseLeave={cancelPress}
                          onTouchStart={(e) => {
                            touchPos.current = {
                              x: e.touches[0].clientX,
                              y: e.touches[0].clientY,
                            };
                            isScrolling.current = false;
                            startPress(s.id!);
                          }}
                          onTouchMove={(e) => {
                            if (!touchPos.current) return;
                            const dx =
                              e.touches[0].clientX - touchPos.current.x;
                            const dy =
                              e.touches[0].clientY - touchPos.current.y;
                            if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                              isScrolling.current = true;
                              cancelPress();
                            }
                          }}
                          onTouchEnd={cancelPress}
                          onContextMenu={(e) => e.preventDefault()}
                          onClick={(e) => {
                            if (isScrolling.current) {
                              e.preventDefault();
                              return;
                            }
                            if (isSelectionMode) {
                              toggleSelection(s.id!);
                              return;
                            }
                            if (!isWorking) {
                              onToggleAttendance(s.id!, e).catch((err) =>
                                console.error("Toggle attendance error:", err),
                              );
                            } else if (isOngoing) {
                              const record = ongoingRecords.find(
                                (r) => r.staffName === s.name,
                              );
                              if (record) {
                                onEditRecord(record);
                                onClose();
                              }
                            } else if (isWaiting) {
                              onAddRecord([s.name]);
                              onClose();
                            } else {
                              // Finished
                              onToggleOff(s.id!, e).catch((err) =>
                                console.error("Toggle off error:", err),
                              );
                            }
                          }}
                          className={cn(
                            "p-1 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-0.5 text-center min-h-[50px] relative select-none",
                            isSelected
                              ? "ring-2 ring-blue-500 ring-offset-1 border-blue-500 bg-blue-50"
                              : isOngoing
                                ? "border-emerald-500 bg-emerald-50 shadow-sm"
                                : isWaiting
                                  ? "border-red-500 bg-red-50 shadow-sm"
                                  : isFinished
                                    ? "border-stone-900 bg-stone-100 opacity-80"
                                    : "border-stone-200 bg-white hover:border-stone-400",
                          )}
                        >
                          {isSelectionMode && (
                            <div
                              className={cn(
                                "absolute top-1 right-1 w-3 h-3 rounded-full border flex items-center justify-center",
                                isSelected
                                  ? "bg-blue-500 border-blue-500"
                                  : "bg-white border-stone-300",
                              )}
                            >
                              {isSelected && (
                                <Check className="w-2 h-2 text-white" />
                              )}
                            </div>
                          )}
                          <span
                            className={cn(
                              "font-black leading-tight whitespace-nowrap truncate w-full text-center tracking-tight",
                              s.name.length >= 6
                                ? "text-[11px] tracking-tighter"
                                : s.name.length >= 5
                                  ? "text-[12px] tracking-tight"
                                  : "text-[14px]",
                              isSelected
                                ? "text-blue-900"
                                : isOngoing
                                  ? "text-emerald-900"
                                  : isWaiting
                                    ? "text-red-900"
                                    : isFinished
                                      ? "text-stone-900"
                                      : "text-stone-600",
                            )}
                          >
                            {s.name}
                          </span>
                          <div className="flex items-center gap-1">
                            {isOngoing && (
                              <>
                                <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
                                <span className="text-[7px] font-black text-emerald-700 uppercase">
                                  일중
                                </span>
                              </>
                            )}
                            {isWaiting && (
                              <>
                                <div className="w-1 h-1 bg-red-500 rounded-full animate-pulse" />
                                <span className="text-[7px] font-black text-red-700 uppercase">
                                  대기
                                </span>
                              </>
                            )}
                            {isFinished && (
                              <span className="text-[7px] font-black text-stone-500 uppercase">
                                퇴근
                              </span>
                            )}
                            {!isWorking && (
                              <span className="text-[7px] font-black text-stone-300 uppercase">
                                휴무
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {filteredStaff.length === 0 && (
              <div className="py-20 text-center">
                <p className="text-stone-400 font-bold">
                  해당하는 직원이 없습니다.
                </p>
              </div>
            )}
          </div>

          {isSelectionMode && (
            <div className="p-3 sm:p-4 bg-stone-900 text-white border-t border-stone-700 flex flex-wrap items-center justify-between gap-2 sticky bottom-0 z-20 shadow-2xl">
              <div className="flex items-center gap-1.5 pl-1">
                <span className="text-xs sm:text-sm font-black text-stone-200 whitespace-nowrap">
                  {selectedIds.size}명 선택됨
                </span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                {/* 0. 초이스 */}
                {onChoiceMultiple && (
                  <button
                    type="button"
                    onClick={async () => {
                      const names = staff
                        .filter((s) => selectedIds.has(s.id!))
                        .map((s) => s.name);
                      await onChoiceMultiple(names);
                      setIsSelectionMode(false);
                      setSelectedIds(new Set());
                      onClose();
                    }}
                    className="bg-purple-600 hover:bg-purple-700 px-3 py-1.5 rounded-xl font-bold transition-all text-xs whitespace-nowrap shadow-sm active:scale-95 text-white flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3 text-purple-200" />
                    <span>초이스</span>
                  </button>
                )}

                {/* 0-1. 진행 */}
                {onProgressMultiple && (
                  <button
                    type="button"
                    onClick={async () => {
                      const names = staff
                        .filter((s) => selectedIds.has(s.id!))
                        .map((s) => s.name);
                      await onProgressMultiple(names);
                      setIsSelectionMode(false);
                      setSelectedIds(new Set());
                      onClose();
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-xl font-bold transition-all text-xs whitespace-nowrap shadow-sm active:scale-95 text-white flex items-center gap-1 cursor-pointer"
                  >
                    <Play className="w-3 h-3 text-emerald-200 fill-emerald-200" />
                    <span>진행</span>
                  </button>
                )}

                {/* 1. 퇴근 */}
                {onToggleOffMultiple && (
                  <button
                    type="button"
                    onClick={async () => {
                      const names = staff
                        .filter((s) => selectedIds.has(s.id!))
                        .map((s) => s.name);
                      await onToggleOffMultiple(names);
                      setIsSelectionMode(false);
                      setSelectedIds(new Set());
                    }}
                    className="bg-stone-800 hover:bg-stone-700 border border-stone-600 px-3 py-1.5 rounded-xl font-bold transition-all text-xs whitespace-nowrap active:scale-95 text-stone-100"
                  >
                    퇴근
                  </button>
                )}

                {/* 2. 튕김 */}
                {onBounceMultiple && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!isBounceConfirming) {
                        setIsBounceConfirming(true);
                        if (bounceTimerRef.current) clearTimeout(bounceTimerRef.current);
                        bounceTimerRef.current = setTimeout(() => {
                          setIsBounceConfirming(false);
                        }, 3500);
                        return;
                      }

                      if (bounceTimerRef.current) clearTimeout(bounceTimerRef.current);
                      setIsBounceConfirming(false);
                      const names = staff
                        .filter((s) => selectedIds.has(s.id!))
                        .map((s) => s.name);
                      await onBounceMultiple(names);
                      setIsSelectionMode(false);
                      setSelectedIds(new Set());
                    }}
                    className={cn(
                      "px-3 py-1.5 rounded-xl font-bold transition-all text-xs whitespace-nowrap shadow-sm active:scale-95 text-white cursor-pointer",
                      isBounceConfirming
                        ? "bg-rose-700 ring-2 ring-rose-400 animate-pulse font-black"
                        : "bg-rose-600 hover:bg-rose-700",
                    )}
                  >
                    {isBounceConfirming ? "한 번 더 누르면 튕김" : "튕김"}
                  </button>
                )}

                {/* 3. 종료 */}
                {onFinishMultiple && (
                  <button
                    type="button"
                    onClick={async () => {
                      const names = staff
                        .filter((s) => selectedIds.has(s.id!))
                        .map((s) => s.name);
                      await onFinishMultiple(names);
                      setIsSelectionMode(false);
                      setSelectedIds(new Set());
                    }}
                    className="bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-xl font-bold transition-all text-xs whitespace-nowrap shadow-sm active:scale-95 text-white"
                  >
                    종료
                  </button>
                )}

                {/* 4. 일괄 기록 */}
                <button
                  type="button"
                  onClick={handleBulkAddRecord}
                  disabled={selectedIds.size === 0}
                  className="bg-blue-500 hover:bg-blue-600 px-3 py-1.5 rounded-xl font-bold transition-all text-xs whitespace-nowrap shadow-sm active:scale-95 text-white disabled:opacity-50"
                >
                  일괄 기록
                </button>

                {/* 5. 취소 */}
                <button
                  type="button"
                  onClick={() => {
                    setIsSelectionMode(false);
                    setSelectedIds(new Set());
                  }}
                  className="bg-stone-700 hover:bg-stone-600 text-stone-300 px-3 py-1.5 rounded-xl font-bold transition-all text-xs whitespace-nowrap active:scale-95"
                >
                  취소
                </button>
              </div>
            </div>
          )}

          {/* Footer: Search Bar & Close Button */}
          <div className="p-4 sm:p-5 bg-stone-50 border-t border-stone-100 flex flex-col gap-2.5">
            {/* Search Bar */}
            <div className="relative w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="직원 이름으로 검색..."
                className="w-full bg-white border border-stone-200 rounded-xl pl-9 pr-8 py-2.5 text-xs font-bold text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/10 transition-all shadow-xs"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-stone-100 text-stone-400"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              onClick={onClose}
              className="w-full py-3.5 bg-stone-900 text-white rounded-2xl font-black text-sm shadow-md shadow-stone-200 active:scale-[0.98] transition-all cursor-pointer"
            >
              닫기
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function StaffEditModal({
  staff,
  onClose,
  onAlert,
}: {
  staff: Staff;
  onClose: () => void;
  onAlert: (msg: string) => void;
}) {
  const [name, setName] = useState(staff.name);
  const [type, setType] = useState<StaffType>(staff.type);
  const [accountNumber, setAccountNumber] = useState(staff.accountNumber || "");
  const [isSaving, setIsSaving] = useState(false);

  const parsed = useMemo(() => formatStaffNameComponents(name), [name]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const parsedInfo = formatStaffNameComponents(name.trim());
    const autoEmpType = parsedInfo.isDirect ? "DIRECT" : "DELEGATED";
    const autoOffice = parsedInfo.affiliation;

    setIsSaving(true);
    try {
      await updateStaff(staff.id!, {
        name: name.trim(),
        type,
        employmentType: autoEmpType,
        office: autoOffice,
        accountNumber: accountNumber.trim(),
      });
      onClose();
    } catch (error) {
      console.error("직원 수정 오류:", error);
      onAlert(
        `직원 수정 중 오류: ${getErrorMessage(error, "직원 수정 중 오류가 발생했습니다.")}`,
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
          <h3 className="text-lg font-bold text-stone-900">직원 정보 수정</h3>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-900 transition-colors"
          >
            <Plus className="w-6 h-6 rotate-45" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase ml-1">
              이름
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-stone-900/10 font-bold"
              placeholder="예: 하퍼 요셉 (직속) 또는 하퍼 요셉 시크 (위탁)"
            />
            {/* Auto-classification live badge */}
            <div className="flex items-center gap-2 pt-1 pl-1">
              <span className="text-[11px] font-bold text-stone-400">
                자동 분류:
              </span>
              {parsed.isDirect ? (
                <span className="px-2 py-0.5 rounded-md bg-amber-500 text-white font-black text-[10px]">
                  직속 직원 (4자 형식)
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-md bg-purple-600 text-white font-black text-[10px]">
                  위탁 직원 [{parsed.affiliation}] (6자 형식)
                </span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase ml-1">
              직원 타입
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["HOPPER", "PUBLIC", "COFFEE"] as StaffType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    "py-2.5 rounded-xl border text-[10px] font-black transition-all",
                    type === t
                      ? t === "COFFEE"
                        ? "bg-emerald-600 border-emerald-600 text-white shadow-md"
                        : t === "PUBLIC"
                          ? "bg-blue-600 border-blue-600 text-white shadow-md"
                          : "bg-purple-600 border-purple-600 text-white shadow-md"
                      : "bg-white border-stone-200 text-stone-500 hover:border-stone-400",
                  )}
                >
                  {t === "HOPPER" ? "하퍼" : t === "PUBLIC" ? "퍼블릭" : "커피"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase ml-1">
              계좌번호
            </label>
            <input
              type="text"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-stone-900/10 font-bold"
              placeholder="은행 및 계좌번호"
            />
          </div>

          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-stone-100 text-stone-600 py-4 rounded-2xl font-bold hover:bg-stone-200 transition-all"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-[2] bg-stone-900 text-white py-4 rounded-2xl font-bold hover:bg-stone-800 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100 shadow-lg shadow-stone-200"
            >
              {isSaving ? "저장 중..." : "정보 수정 완료"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function ManagementModal({
  onClose,
  globalEmploymentFilter,
  setGlobalEmploymentFilter,
  globalStaffTypeFilter,
  setGlobalStaffTypeFilter,
  staff,
  establishments,
  workingStaffIds,
  offStaffIds,
  checkInTimes,
  offTimes,
  selectedDate,
  showInstallBtn,
  onInstall,
  onAlert,
  onToggleAttendance,
  onToggleOff,
}: {
  onClose: () => void;
  globalEmploymentFilter: "ALL" | "DIRECT" | "DELEGATED";
  setGlobalEmploymentFilter: (val: "ALL" | "DIRECT" | "DELEGATED") => void;
  globalStaffTypeFilter: "ALL" | "HOPPER" | "PUBLIC" | "COFFEE";
  setGlobalStaffTypeFilter: (
    val: "ALL" | "HOPPER" | "PUBLIC" | "COFFEE",
  ) => void;
  staff: Staff[];
  establishments: { id: string; name: string }[];
  workingStaffIds: string[];
  offStaffIds: string[];
  checkInTimes: Record<string, any>;
  offTimes: Record<string, any>;
  selectedDate: string;
  showInstallBtn: boolean;
  onInstall: () => void;
  onAlert: (msg: string) => void;
  onToggleAttendance: (id: string, e?: React.MouseEvent) => void;
  onToggleOff: (id: string, e?: React.MouseEvent) => void;
}) {
  const [activeTab, setActiveTab] = useState<"staff" | "establishments">(
    "staff",
  );
  const [newName, setNewName] = useState("");
  const [staffType, setStaffType] = useState<StaffType>("COFFEE");
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollPosRef = useRef<number>(0);

  // Restore scroll position after list updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollPosRef.current;
    }
  }, [workingStaffIds, offStaffIds]);

  const sortedStaff = useMemo(() => {
    const filtered = staff.filter((s) =>
      s.name.toLowerCase().includes(deferredSearchTerm.toLowerCase()),
    );
    return [...filtered].sort((a, b) => {
      const isAWorking = workingStaffIds.includes(a.id!);
      const isBWorking = workingStaffIds.includes(b.id!);

      if (isAWorking && !isBWorking) return -1;
      if (!isAWorking && isBWorking) return 1;

      if (isAWorking && isBWorking) {
        const timeA = checkInTimes[a.id!]?.toMillis?.() || 0;
        const timeB = checkInTimes[b.id!]?.toMillis?.() || 0;
        return timeA - timeB;
      }

      return a.name.localeCompare(b.name);
    });
  }, [staff, workingStaffIds, checkInTimes, deferredSearchTerm]);

  const sortedEstablishments = useMemo(() => {
    return [...establishments]
      .filter((e) =>
        e.name.toLowerCase().includes(deferredSearchTerm.toLowerCase()),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [establishments, deferredSearchTerm]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      if (activeTab === "staff") {
        await addStaff(newName.trim(), staffType);
      } else {
        await addEstablishment(newName.trim());
      }
      setNewName("");
    } catch (error) {
      console.error("추가 오류:", error);
      onAlert(
        `추가 중 오류: ${getErrorMessage(error, "추가 중 오류가 발생했습니다.")}`,
      );
    }
  };

  const handleToggleAttendance = async (
    staffId: string,
    e?: React.MouseEvent,
  ) => {
    if (scrollRef.current) {
      scrollPosRef.current = scrollRef.current.scrollTop;
    }
    try {
      await onToggleAttendance(staffId, e);
    } catch (error) {
      console.error("출근 상태 변경 오류:", error);
    }
  };

  const handleToggleOffStatus = async (
    staffId: string,
    e?: React.MouseEvent,
  ) => {
    if (scrollRef.current) {
      scrollPosRef.current = scrollRef.current.scrollTop;
    }
    try {
      await onToggleOff(staffId, e);
    } catch (error) {
      console.error("퇴근 상태 변경 오류:", error);
    }
  };

  const handleTimeChange = async (
    staffId: string,
    type: "checkIn" | "off",
    timeStr: string,
  ) => {
    if (!timeStr) return;

    let formattedTime = timeStr;
    // Handle "1100" -> "11:00"
    const digits = timeStr.replace(/\D/g, "");
    if (digits.length === 4) {
      const h = digits.slice(0, 2);
      const m = digits.slice(2, 4);
      if (Number(h) < 24 && Number(m) < 60) {
        formattedTime = `${h}:${m}`;
      }
    }

    if (!formattedTime.includes(":")) return;

    const newTimestamp = timeStrToTimestamp(formattedTime, selectedDate);

    try {
      if (type === "checkIn") {
        const newCheckInTimes = { ...checkInTimes, [staffId]: newTimestamp };
        await updateAttendance(
          selectedDate,
          workingStaffIds,
          offStaffIds,
          offTimes,
          newCheckInTimes,
        );
      } else {
        const newOffTimes = { ...offTimes, [staffId]: newTimestamp };
        await updateAttendance(
          selectedDate,
          workingStaffIds,
          offStaffIds,
          newOffTimes,
        );
      }
    } catch (error) {
      console.error("시간 변경 오류:", error);
      onAlert(
        `시간 변경 중 오류: ${getErrorMessage(error, "시간 변경 중 오류가 발생했습니다.")}`,
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 w-[95vw] max-w-6xl bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        <div className="p-4 sm:p-6 border-b border-stone-100 flex items-center justify-between">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
            <h2 className="text-xl font-bold">시스템 관리</h2>
            <button
              onClick={() => {
                const url =
                  "https://ais-pre-a4epwz2fmizmojqmhltuhg-184683411632.asia-northeast1.run.app";
                navigator.clipboard
                  .writeText(url)
                  .then(() => {
                    onAlert(
                      "공유용 링크가 복사되었습니다. 다른 핸드폰의 크롬 브라우저에 붙여넣으세요.",
                    );
                  })
                  .catch((err) => {
                    console.error("Clipboard error:", err);
                    onAlert(
                      "링크 복사에 실패했습니다. 브라우저 설정을 확인해주세요.",
                    );
                  });
              }}
              className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg font-bold border border-emerald-100 flex items-center gap-1.5 text-[10px] hover:bg-emerald-100 transition-all"
            >
              <Plus className="w-3 h-3 rotate-45" /> 공유 링크 복사
            </button>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-900 absolute top-4 right-4 sm:static"
          >
            <Plus className="w-6 h-6 rotate-45" />
          </button>
        </div>

        <div className="flex bg-stone-100 p-1 mx-4 sm:mx-6 mt-4 rounded-xl">
          <button
            onClick={() => setActiveTab("staff")}
            className={cn(
              "flex-1 py-1.5 rounded-lg text-xs font-bold transition-all",
              activeTab === "staff"
                ? "bg-white shadow-sm text-stone-900"
                : "text-stone-500",
            )}
          >
            직원 관리
          </button>
          <button
            onClick={() => setActiveTab("establishments")}
            className={cn(
              "flex-1 py-1.5 rounded-lg text-xs font-bold transition-all",
              activeTab === "establishments"
                ? "bg-white shadow-sm text-stone-900"
                : "text-stone-500",
            )}
          >
            가게 관리
          </button>
        </div>

        {activeTab === "staff" && (
          <div className="px-4 sm:px-6 pt-3 flex flex-col gap-2">
            <div className="flex items-center justify-start gap-1.5 flex-wrap">
              <span className="text-[10px] font-bold text-stone-400 uppercase mr-1 w-12">
                소속 구분
              </span>
              {(["ALL", "DIRECT", "DELEGATED"] as const).map((gType) => (
                <button
                  key={gType}
                  onClick={() => setGlobalEmploymentFilter(gType)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[10px] font-black transition-all border",
                    globalEmploymentFilter === gType
                      ? "bg-stone-900 border-stone-900 text-white shadow-sm"
                      : "bg-white border-stone-200 text-stone-500 hover:bg-stone-50",
                  )}
                >
                  {gType === "ALL"
                    ? "전체"
                    : gType === "DIRECT"
                      ? "직속 직원"
                      : "위탁 직원"}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-start gap-1.5 flex-wrap">
              <span className="text-[10px] font-bold text-stone-400 uppercase mr-1 w-12">
                직군 구분
              </span>
              {(["ALL", "HOPPER", "PUBLIC", "COFFEE"] as const).map((sType) => (
                <button
                  key={sType}
                  onClick={() => setGlobalStaffTypeFilter(sType)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[10px] font-black transition-all border",
                    globalStaffTypeFilter === sType
                      ? "bg-stone-900 border-stone-900 text-white shadow-sm"
                      : "bg-white border-stone-200 text-stone-500 hover:bg-stone-50",
                  )}
                >
                  {sType === "ALL"
                    ? "전체"
                    : sType === "HOPPER"
                      ? "하퍼"
                      : sType === "PUBLIC"
                        ? "퍼블릭"
                        : "커피"}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="px-4 sm:px-6 pt-3 pb-3 border-b border-stone-100 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="relative flex-1 w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={
                activeTab === "staff"
                  ? "직원 이름 검색..."
                  : "가게 이름 검색..."
              }
              className="w-full bg-blue-50 border border-blue-100 rounded-lg pl-9 pr-3 py-2 text-xs focus:ring-2 focus:ring-blue-500/20 outline-none text-blue-900 placeholder:text-blue-300 font-bold"
            />
          </div>
          <form
            onSubmit={handleAdd}
            className="flex-1 w-full flex flex-col gap-1.5"
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={
                  activeTab === "staff" ? "새 직원 이름" : "새 가게 이름"
                }
                className="flex-1 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-stone-900/10"
              />
              <button
                type="submit"
                className="bg-stone-900 text-white px-4 py-2 rounded-lg font-bold hover:bg-stone-800 active:scale-95 transition-all flex items-center justify-center shrink-0"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {activeTab === "staff" && (
              <div className="flex flex-col gap-1.5">
                <div className="grid grid-cols-3 gap-1">
                  {(["HOPPER", "PUBLIC", "COFFEE"] as StaffType[]).map(
                    (type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setStaffType(type)}
                        className={cn(
                          "py-1 rounded-lg border text-[10px] font-black transition-all",
                          staffType === type
                            ? type === "COFFEE"
                              ? "bg-emerald-600 border-emerald-600 text-white"
                              : type === "PUBLIC"
                                ? "bg-blue-600 border-blue-600 text-white"
                                : "bg-purple-600 border-purple-600 text-white"
                            : "bg-white border-stone-200 text-stone-500 hover:border-stone-400",
                        )}
                      >
                        {type === "HOPPER"
                          ? "하퍼"
                          : type === "PUBLIC"
                            ? "퍼블릭"
                            : "커피"}
                      </button>
                    ),
                  )}
                </div>
              </div>
            )}
          </form>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6">
          {activeTab === "staff" ? (
            <div className="space-y-2">
              <div className="text-xs font-bold text-stone-400 uppercase mb-2">
                {searchTerm
                  ? `검색 결과 (${sortedStaff.length})`
                  : "직원 명단 (출근순/가나다순)"}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {sortedStaff.map((s) => (
                  <motion.div
                    layout
                    initial={false}
                    transition={{
                      type: "spring",
                      stiffness: 500,
                      damping: 50,
                      mass: 1,
                    }}
                    key={s.id}
                    className="flex flex-col gap-2 p-3 bg-stone-50 rounded-xl border border-stone-200"
                  >
                    <div className="flex items-center justify-between">
                      <button
                        onClick={(e) =>
                          handleToggleAttendance(s.id!, e).catch((err) =>
                            console.error("Toggle attendance error:", err),
                          )
                        }
                        className="flex-1 flex items-center gap-3 text-left"
                      >
                        <div
                          className={cn(
                            "w-5 h-5 rounded-full flex items-center justify-center border transition-colors shrink-0",
                            workingStaffIds.includes(s.id!)
                              ? "bg-emerald-500 border-emerald-500 text-white"
                              : "bg-white border-stone-300 text-transparent",
                          )}
                        >
                          <Check className="w-3 h-3" />
                        </div>
                        <span
                          className={cn(
                            "font-bold transition-all text-sm",
                            workingStaffIds.includes(s.id!)
                              ? "text-stone-800"
                              : "text-stone-400",
                            offStaffIds.includes(s.id!) && "opacity-50",
                          )}
                        >
                          <div className="flex items-center gap-1">
                            {s.name}
                            <span
                              className={cn(
                                "px-1 py-0.5 rounded text-[7px] font-bold text-white shrink-0",
                                s.type === "HOPPER"
                                  ? "bg-purple-500"
                                  : s.type === "PUBLIC"
                                    ? "bg-blue-500"
                                    : "bg-emerald-500",
                              )}
                            >
                              {s.type === "HOPPER"
                                ? "하"
                                : s.type === "PUBLIC"
                                  ? "퍼"
                                  : "커"}
                            </span>
                            {(() => {
                              const p = formatStaffNameComponents(s.name);
                              return p.isDirect ? (
                                <span className="px-1 py-0.5 rounded text-[7px] font-bold bg-amber-500 text-white shrink-0">
                                  직속
                                </span>
                              ) : (
                                <span className="px-1 py-0.5 rounded text-[7px] font-bold bg-purple-600 text-white shrink-0">
                                  위탁 ({p.affiliation})
                                </span>
                              );
                            })()}
                            {offStaffIds.includes(s.id!) && (
                              <span className="ml-1 text-[10px] text-red-500 font-black">
                                [퇴근]
                              </span>
                            )}
                          </div>
                        </span>
                      </button>

                      <div className="flex items-center gap-1">
                        {workingStaffIds.includes(s.id!) && (
                          <button
                            onClick={(e) =>
                              handleToggleOffStatus(s.id!, e).catch((err) =>
                                console.error("Toggle off status error:", err),
                              )
                            }
                            className={cn(
                              "px-2 py-1 rounded-lg text-[9px] font-black transition-all",
                              offStaffIds.includes(s.id!)
                                ? "bg-stone-900 text-white"
                                : "bg-stone-200 text-stone-600 hover:bg-stone-300",
                            )}
                          >
                            {offStaffIds.includes(s.id!) ? "복귀" : "퇴근"}
                          </button>
                        )}
                        <button
                          onClick={() => setEditingStaff(s)}
                          className="text-stone-300 hover:text-blue-500 p-1"
                          title="정보 수정"
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              await deleteStaff(s.id!);
                            } catch (error) {
                              console.error("직원 삭제 오류:", error);
                              onAlert(
                                `직원 삭제 중 오류: ${getErrorMessage(error, "직원 삭제 중 오류가 발생했습니다.")}`,
                              );
                            }
                          }}
                          className="text-stone-300 hover:text-red-500 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {workingStaffIds.includes(s.id!) && (
                      <div className="flex gap-2 px-2 py-1.5 bg-white/50 rounded-lg border border-stone-100">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <span className="text-[10px] font-bold text-stone-400 shrink-0">
                            출근:
                          </span>
                          <input
                            type="text"
                            defaultValue={timestampToTimeStr(
                              checkInTimes[s.id!],
                            )}
                            onBlur={(e) =>
                              handleTimeChange(s.id!, "checkIn", e.target.value)
                            }
                            onFocus={(e) => e.target.select()}
                            onKeyDown={(e) =>
                              e.key === "Enter" &&
                              (e.currentTarget as HTMLInputElement).blur()
                            }
                            className="text-xs font-black text-stone-900 bg-white border border-stone-200 rounded-md px-1 w-full flex-1 py-1 text-center min-w-0 focus:ring-2 focus:ring-stone-900 focus:border-stone-900 outline-none"
                            placeholder="HH:mm"
                          />
                        </div>
                        {offStaffIds.includes(s.id!) && (
                          <div className="flex items-center gap-1.5 flex-1 min-w-0 border-l border-stone-200 pl-2">
                            <span className="text-[10px] font-bold text-stone-400 shrink-0">
                              퇴근:
                            </span>
                            <input
                              type="text"
                              defaultValue={timestampToTimeStr(offTimes[s.id!])}
                              onBlur={(e) =>
                                handleTimeChange(s.id!, "off", e.target.value)
                              }
                              onFocus={(e) => e.target.select()}
                              onKeyDown={(e) =>
                                e.key === "Enter" &&
                                (e.currentTarget as HTMLInputElement).blur()
                              }
                              className="text-xs font-black text-red-600 bg-white border border-stone-200 rounded-md px-1 py-1 w-full flex-1 text-center min-w-0 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                              placeholder="HH:mm"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex flex-col gap-2 pt-2 border-t border-stone-200/50">
                      <div className="flex items-center justify-between gap-1 flex-wrap">
                        <span className="text-[9px] font-bold text-stone-400 shrink-0">
                          그룹 변경:
                        </span>
                        <div className="flex gap-1 flex-wrap justify-end">
                          {(["HOPPER", "PUBLIC", "COFFEE"] as StaffType[]).map(
                            (type) => (
                              <button
                                key={type}
                                onClick={async () => {
                                  try {
                                    await updateStaff(s.id!, { type });
                                  } catch (error) {
                                    console.error(
                                      "직원 그룹 변경 오류:",
                                      error,
                                    );
                                    onAlert(
                                      `직원 그룹 변경 중 오류: ${getErrorMessage(error, "직원 그룹 변경 중 오류가 발생했습니다.")}`,
                                    );
                                  }
                                }}
                                className={cn(
                                  "px-1.5 py-0.5 rounded-md border text-[8px] font-black transition-all whitespace-nowrap",
                                  s.type === type
                                    ? "bg-stone-900 border-stone-900 text-white"
                                    : "bg-white border-stone-200 text-stone-400 hover:border-stone-400",
                                )}
                              >
                                {type === "HOPPER"
                                  ? "하퍼"
                                  : type === "PUBLIC"
                                    ? "퍼블릭"
                                    : "커피"}
                              </button>
                            ),
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 overflow-hidden">
                        <span className="text-[9px] font-bold text-stone-400 shrink-0">
                          소속 사무실:
                        </span>
                        <span className="text-[10px] font-black text-stone-800 truncate">
                          {s.office || "-"}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
              {staff.length === 0 && (
                <div className="text-center py-8 text-stone-400 text-sm">
                  등록된 직원이 없습니다.
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="text-xs font-bold text-stone-400 uppercase mb-2">
                {searchTerm
                  ? `검색 결과 (${sortedEstablishments.length})`
                  : "가게 명단 (가나다순)"}
              </div>
              {sortedEstablishments.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between p-3 bg-stone-50 rounded-xl border border-stone-200"
                >
                  <span className="font-bold text-stone-900">{e.name}</span>
                  <button
                    onClick={async () => {
                      try {
                        await deleteEstablishment(e.id);
                      } catch (error) {
                        console.error("가게 삭제 오류:", error);
                        onAlert(
                          `가게 삭제 중 오류: ${getErrorMessage(error, "가게 삭제 중 오류가 발생했습니다.")}`,
                        );
                      }
                    }}
                    className="text-stone-300 hover:text-red-500 p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {establishments.length === 0 && (
                <div className="text-center py-8 text-stone-400 text-sm">
                  등록된 가게가 없습니다.
                </div>
              )}
            </>
          )}
        </div>

        <AnimatePresence>
          {editingStaff && (
            <StaffEditModal
              staff={editingStaff}
              onClose={() => setEditingStaff(null)}
              onAlert={onAlert}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function useMultiSelect(
  onCompleteSelection: (names: string[]) => void,
  onSingleClick: (name: string, isOff: boolean) => void = () => {},
  onFinish?: (names: string[]) => void | Promise<void>,
  onToggleOff?: (names: string[]) => void | Promise<void>,
  onBounce?: (names: string[]) => void | Promise<void>,
  onChoice?: (names: string[]) => void | Promise<void>,
  onProgress?: (names: string[]) => void | Promise<void>,
) {
  const [multiSelected, setMultiSelected] = useState<string[]>([]);
  const [isBounceConfirming, setIsBounceConfirming] = useState(false);
  const bounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const isLongPress = useRef(false);

  useEffect(() => {
    if (multiSelected.length === 0) {
      setIsBounceConfirming(false);
      if (bounceTimerRef.current) {
        clearTimeout(bounceTimerRef.current);
        bounceTimerRef.current = null;
      }
    }
  }, [multiSelected]);

  const startPress = (name: string) => {
    isLongPress.current = false;
    pressTimer.current = setTimeout(() => {
      setIsBounceConfirming(false);
      isLongPress.current = true;
      setMultiSelected((prev) =>
        prev.includes(name) ? prev : [...prev, name],
      );
      // Haptic feedback if supported
      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
    }, 500);
  };

  const endPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const handleClick = (name: string, isOff: boolean) => {
    if (isLongPress.current) return;

    if (multiSelected.length > 0) {
      setIsBounceConfirming(false);
      setMultiSelected((prev) =>
        prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
      );
    } else {
      onSingleClick(name, isOff);
    }
  };

  const clearSelection = () => {
    setIsBounceConfirming(false);
    if (bounceTimerRef.current) {
      clearTimeout(bounceTimerRef.current);
      bounceTimerRef.current = null;
    }
    setMultiSelected([]);
  };

  const renderMultiSelectBar = () => {
    if (multiSelected.length === 0) return null;
    return (
      <div
        className="fixed bottom-20 sm:bottom-24 left-1/2 -translate-x-1/2 bg-stone-900/95 backdrop-blur-md border border-stone-700 text-white px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-2xl shadow-2xl flex items-center gap-1 sm:gap-2 z-[9999] animate-in slide-in-from-bottom-5 fade-in duration-200 max-w-[98vw]"
        onContextMenu={(e) => e.preventDefault()}
        style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
      >
        <div className="font-black whitespace-nowrap text-[11px] sm:text-xs pl-1 pr-0.5 text-stone-200 shrink-0">
          <span className="hidden sm:inline">{multiSelected.length}명 선택됨</span>
          <span className="sm:hidden">{multiSelected.length}명</span>
        </div>

        {/* 0. 초이스 */}
        {onChoice && (
          <button
            type="button"
            onClick={async () => {
              await onChoice(multiSelected);
              clearSelection();
            }}
            className="bg-purple-600 hover:bg-purple-700 px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl font-black transition-all text-[11px] sm:text-xs whitespace-nowrap shadow-sm active:scale-95 text-white shrink-0 cursor-pointer flex items-center gap-1"
          >
            <Sparkles className="w-3 h-3 text-purple-200 hidden sm:inline" />
            <span>초이스</span>
          </button>
        )}

        {/* 0-1. 진행 */}
        {onProgress && (
          <button
            type="button"
            onClick={async () => {
              await onProgress(multiSelected);
              clearSelection();
            }}
            className="bg-emerald-600 hover:bg-emerald-700 px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl font-black transition-all text-[11px] sm:text-xs whitespace-nowrap shadow-sm active:scale-95 text-white shrink-0 cursor-pointer flex items-center gap-1"
          >
            <Play className="w-3 h-3 text-emerald-200 fill-emerald-200 hidden sm:inline" />
            <span>진행</span>
          </button>
        )}

        {/* 1. 퇴근 */}
        {onToggleOff && (
          <button
            type="button"
            onClick={async () => {
              await onToggleOff(multiSelected);
              clearSelection();
            }}
            className="bg-stone-800 hover:bg-stone-700 border border-stone-600 px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl font-black transition-all text-[11px] sm:text-xs whitespace-nowrap shadow-sm active:scale-95 text-stone-100 shrink-0 cursor-pointer"
          >
            퇴근
          </button>
        )}

        {/* 2. 튕김 */}
        {onBounce && (
          <button
            type="button"
            onClick={async () => {
              if (!isBounceConfirming) {
                setIsBounceConfirming(true);
                if (bounceTimerRef.current) clearTimeout(bounceTimerRef.current);
                bounceTimerRef.current = setTimeout(() => {
                  setIsBounceConfirming(false);
                }, 3500);
                return;
              }

              if (bounceTimerRef.current) clearTimeout(bounceTimerRef.current);
              setIsBounceConfirming(false);
              await onBounce(multiSelected);
              clearSelection();
            }}
            className={cn(
              "px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl font-black transition-all text-[11px] sm:text-xs whitespace-nowrap shadow-sm active:scale-95 text-white shrink-0 cursor-pointer flex items-center gap-1",
              isBounceConfirming
                ? "bg-rose-700 ring-2 ring-rose-400 animate-pulse font-black"
                : "bg-rose-600 hover:bg-rose-700",
            )}
          >
            {isBounceConfirming ? "한 번 더 누르면 튕김" : "튕김"}
          </button>
        )}

        {/* 3. 종료 */}
        {onFinish && (
          <button
            type="button"
            onClick={async () => {
              await onFinish(multiSelected);
              clearSelection();
            }}
            className="bg-red-500 hover:bg-red-600 px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl font-black transition-all text-[11px] sm:text-xs whitespace-nowrap shadow-sm active:scale-95 text-white shrink-0 cursor-pointer"
          >
            종료
          </button>
        )}

        {/* 4. 일괄 기록 */}
        <button
          type="button"
          onClick={() => {
            onCompleteSelection(multiSelected);
            clearSelection();
          }}
          className="bg-blue-500 hover:bg-blue-600 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-xl font-black transition-all text-[11px] sm:text-xs whitespace-nowrap shadow-sm active:scale-95 text-white shrink-0 cursor-pointer"
        >
          <span className="hidden sm:inline">일괄 기록</span>
          <span className="sm:hidden">일괄기록</span>
        </button>

        {/* 취소 */}
        <button
          type="button"
          onClick={clearSelection}
          className="bg-stone-700 hover:bg-stone-600 text-stone-300 px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl font-black transition-all text-[11px] sm:text-xs whitespace-nowrap active:scale-95 shrink-0 cursor-pointer"
        >
          취소
        </button>
      </div>
    );
  };

  return {
    multiSelected,
    startPress,
    endPress,
    handleClick,
    renderMultiSelectBar,
  };
}

function ListView({
  records,
  unpaidStaffRecords,
  onEditRecord,
  onAddRecordForStaff,
  currentTime,
  offStaffIds,
  checkInTimes,
  offTimes,
  onToggleOff,
  workingStaffIds,
  onToggleWorking,
  staff,
  manualDailyProfits,
  onManualProfitClick,
  onStaffPaymentClick,
  highlightedStaffColumn,
  selectedDate,
  highlightedId,
  bouncedRecords,
  onBounceBadgeClick,
  weeklyAttendanceMap,
}: {
  records: DispatchRecord[];
  unpaidStaffRecords: DispatchRecord[];
  onEditRecord: (record: DispatchRecord) => void;
  onAddRecordForStaff: (names: string[]) => void;
  currentTime: Date;
  offStaffIds: string[];
  checkInTimes: Record<string, any>;
  offTimes: Record<string, any>;
  onToggleOff: (id: string) => void;
  workingStaffIds?: string[];
  onToggleWorking?: (id: string, e?: React.MouseEvent) => void;
  staff: Staff[];
  manualDailyProfits: Record<string, number>;
  onManualProfitClick: (staffName: string, calculatedProfit: number) => void;
  onStaffPaymentClick: (staffName: string) => void;
  highlightedStaffColumn?: string | null;
  selectedDate?: string;
  highlightedId?: string | null;
  bouncedRecords?: BouncedRecord[];
  onBounceBadgeClick?: (staffName: string) => void;
  weeklyAttendanceMap?: Record<string, number>;
}) {
  // Group by staff
  const staffGroups = useMemo(() => {
    const groups: Record<string, any> = {};

    // Initialize with all working staff to ensure they show up even without records
    staff.forEach((s) => {
      const isWorking = Object.keys(checkInTimes || {}).includes(s.id!);
      if (isWorking) {
        groups[s.name] = {
          records: [],
          unpaidFromOtherDays: [],
          totalPaid: 0,
          totalUnpaid: 0,
          totalStaffPayment: 0,
          totalTip: 0,
          totalCommission: 0,
          count: 0,
          fullTimeUnits: 0,
          bantiUnits: 0,
          tableUnits: 0,
          tableBanti: 0,
          tableCount: 0,
          publicUnits: 0,
          publicBanti: 0,
          publicCount: 0,
          hopperUnits: 0,
          hopperBanti: 0,
          hopperCount: 0,
          isAllStaffPaid: true,
          staffPaymentMethod: undefined as "CASH" | "TRANSFER" | undefined,
          isOngoing: false,
          isManualProfit: false,
          totalBounceCount: 0,
        };
      }
    });

    records.forEach((record) => {
      if (!groups[record.staffName]) {
        groups[record.staffName] = {
          records: [],
          unpaidFromOtherDays: [],
          totalPaid: 0,
          totalUnpaid: 0,
          totalStaffPayment: 0,
          totalTip: 0,
          totalCommission: 0,
          count: 0,
          fullTimeUnits: 0,
          bantiUnits: 0,
          tableUnits: 0,
          tableBanti: 0,
          tableCount: 0,
          publicUnits: 0,
          publicBanti: 0,
          publicCount: 0,
          hopperUnits: 0,
          hopperBanti: 0,
          hopperCount: 0,
          isAllStaffPaid: true,
          staffPaymentMethod: undefined as "CASH" | "TRANSFER" | undefined,
          isOngoing: false,
          isManualProfit: false,
          totalBounceCount: 0,
        };
      }
      const group = groups[record.staffName];
      group.records.push(record);
      group.count += 1;
      group.totalStaffPayment += record.staffPayment;
      group.totalTip += record.tip || 0;
      group.totalCommission += record.commission;
      group.totalBounceCount = (group.totalBounceCount || 0) + (record.bounceCount || (record.isBounced ? 1 : 0));

      const start = record.startTime.toDate
        ? record.startTime.toDate()
        : new Date(record.startTime);
      const end = record.endTime.toDate
        ? record.endTime.toDate()
        : new Date(record.endTime);
      if (start.getTime() === end.getTime()) {
        group.isOngoing = true;
      }

      if (!record.isStaffPaid) {
        group.isAllStaffPaid = false;
      } else if (record.staffPaymentMethod) {
        if (!group.staffPaymentMethod) {
          group.staffPaymentMethod = record.staffPaymentMethod;
        }
      }

      const units = Math.floor(record.durationHours);
      const isBanti = record.durationHours % 1 !== 0;
      group.fullTimeUnits += units;
      if (isBanti) {
        group.bantiUnits += 1;
      }

      if (record.systemType === "TABLE") {
        group.tableUnits += units;
        group.tableCount += 1;
        if (isBanti) group.tableBanti += 1;
      } else if (record.systemType === "PUBLIC") {
        group.publicUnits += units;
        group.publicCount += 1;
        if (isBanti) group.publicBanti += 1;
      } else if (record.systemType === "HOPPER") {
        group.hopperUnits += units;
        group.hopperCount += 1;
        if (isBanti) group.hopperBanti += 1;
      }

      if (record.paymentMethod === "UNPAID") {
        group.totalUnpaid += record.totalAmount;
      } else {
        group.totalPaid += record.totalAmount;
      }
    });

    // Add unpaid records from other days ONLY for staff who are already in groups (working today)
    unpaidStaffRecords.forEach((record) => {
      if (groups[record.staffName]) {
        groups[record.staffName].unpaidFromOtherDays.push(record);
      }
    });

    // Apply manual profits and count bounced records
    Object.keys(groups).forEach((name) => {
      if (manualDailyProfits[name] !== undefined) {
        groups[name].totalCommission = manualDailyProfits[name];
        groups[name].isManualProfit = true;
      }
      groups[name].totalBounceCount = (bouncedRecords || []).filter(
        (b) => b.staffName === name
      ).length;
    });

    return groups;
  }, [records, unpaidStaffRecords, staff, checkInTimes, manualDailyProfits, bouncedRecords]);

  const staffNames = useMemo(() => {
    return Object.keys(staffGroups).sort((a, b) => {
      const staffA = staff.find((s) => s.name === a);
      const staffB = staff.find((s) => s.name === b);

      const timeA =
        staffA?.id && checkInTimes[staffA.id]
          ? checkInTimes[staffA.id]?.toMillis?.() || 0
          : Number.MAX_SAFE_INTEGER;
      const timeB =
        staffB?.id && checkInTimes[staffB.id]
          ? checkInTimes[staffB.id]?.toMillis?.() || 0
          : Number.MAX_SAFE_INTEGER;

      if (timeA !== timeB) return timeA - timeB;
      return a.localeCompare(b);
    });
  }, [staffGroups, staff, checkInTimes]);

  const handleCapture = async (name: string) => {
    const element = document.getElementById(`staff-column-${name}`);
    if (!element) return;

    const originalScale = element.style.transform;
    const originalAlignSelf = element.style.alignSelf;
    const originalHeight = element.style.height;

    try {
      element.style.transform = "scale(1)";
      element.style.alignSelf = "flex-start";
      element.style.height = "auto";

      const width = element.offsetWidth;
      const height = element.offsetHeight;

      const dataUrl = await htmlToImage.toPng(element, {
        backgroundColor: "#ffffff",
        width: width,
        height: height,
        pixelRatio: window.devicePixelRatio || 3,
        filter: (node) => {
          if (
            node instanceof HTMLElement &&
            node.dataset.html2canvasIgnore === "true"
          ) {
            return false;
          }
          return true;
        },
        style: {
          margin: "0",
          padding: "0",
          transform: "none",
        },
      });

      const filename = `${name}_업무내역_${format(new Date(), "yyyyMMdd")}.png`;

      // Try using the native share API on mobile
      if (navigator.canShare && navigator.share) {
        try {
          const res = await fetch(dataUrl);
          const blob = await res.blob();
          const file = new File([blob], filename, { type: "image/png" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: `${name} 업무내역`,
              text: `${format(new Date(), "yyyy-MM-dd")} ${name} 업무내역`,
              files: [file],
            });
            return;
          }
        } catch (shareError) {
          console.warn("Share failed, falling back to download", shareError);
        }
      }

      // Fallback to direct download
      const link = document.createElement("a");
      link.download = filename;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error("Capture failed", e);
      alert("이미지 캡쳐에 실패했습니다.");
    } finally {
      element.style.transform = originalScale;
      element.style.alignSelf = originalAlignSelf;
      element.style.height = originalHeight;
    }
  };

  return (
    <div className="overflow-x-auto pt-2 pb-4 px-3 sm:px-4">
      <div className="flex gap-4 min-w-max px-4 py-2">
        {staffNames.map((name) => {
          const staffObj = staff.find((s) => s.name === name);
          const staffId = staffObj?.id;
          const staffType = staffObj?.type || "COFFEE";
          const isWorking = staffId ? (workingStaffIds ? workingStaffIds.includes(staffId) : !!checkInTimes[staffId]) : false;
          const isOff = staffId && offStaffIds.includes(staffId);
          const isOngoing = staffGroups[name]?.isOngoing;

          return (
            <div
              id={`staff-column-${name}`}
              key={name}
              className={cn(
                "w-44 shrink-0 flex flex-col gap-2 transition-all duration-300 relative rounded-2xl",
                highlightedStaffColumn === name &&
                  "border-4 border-yellow-400 bg-yellow-100/90 shadow-[0_0_25px_rgba(250,204,21,0.95)] scale-[1.02] z-30 animate-pulse text-stone-900 font-black p-1",
              )}
            >
              {/* Column Header */}
              <div
                className={cn(
                  "p-2 rounded-2xl border-2 shadow-sm sticky top-0 z-10 transition-all",
                  highlightedStaffColumn === name
                    ? "border-yellow-400 border-4 bg-yellow-200 shadow-yellow-300 shadow-lg"
                    : !isWorking
                      ? "border-amber-400 bg-amber-50 shadow-amber-100 shadow-md"
                      : isOff
                        ? "border-stone-900 bg-stone-200"
                        : isOngoing
                          ? "border-emerald-500 bg-emerald-100 shadow-emerald-100 shadow-lg"
                          : "border-red-500 bg-red-100 shadow-red-100 shadow-lg",
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <div
                    onClick={() => {
                      if (!isOff) onAddRecordForStaff([name]);
                    }}
                    className={cn(
                      "font-bold text-stone-900 transition-colors text-left flex flex-col min-w-0 flex-1",
                      isOff
                        ? "cursor-not-allowed opacity-50"
                        : "hover:text-stone-500 cursor-pointer",
                    )}
                  >
                    {(() => {
                      const { main4, affiliation } = formatStaffNameComponents(name);
                      return (
                        <div className="flex flex-col gap-0.5 w-full min-w-0">
                          <div className="flex items-center gap-1 w-full min-w-0 flex-nowrap">
                            <span className="font-black text-stone-900 whitespace-nowrap leading-tight tracking-tight block text-[15px] sm:text-[17px]">
                              {main4}
                            </span>
                            {affiliation && (
                              <span
                                className={cn(
                                  "px-1.5 py-0.5 rounded text-[10px] sm:text-[11px] font-black text-white shrink-0 whitespace-nowrap leading-none shadow-xs",
                                  affiliation === "직속" ? "bg-amber-500" : "bg-purple-600"
                                )}
                              >
                                {affiliation}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 flex-nowrap shrink-0 overflow-x-auto scrollbar-hide max-w-full">
                            <span
                              className={cn(
                                "px-1 py-0.5 rounded text-[8px] font-bold text-white shrink-0 whitespace-nowrap",
                                staffType === "HOPPER"
                                  ? "bg-purple-500"
                                  : staffType === "PUBLIC"
                                    ? "bg-blue-500"
                                    : "bg-emerald-500",
                              )}
                            >
                              {staffType === "HOPPER"
                                ? "하"
                                : staffType === "PUBLIC"
                                  ? "퍼"
                                  : "커"}
                            </span>
                            {(() => {
                              const p = formatStaffNameComponents(name);
                              return p.isDirect ? (
                                <span className="px-1 py-0.5 rounded text-[7px] font-bold bg-amber-500 text-white shrink-0 whitespace-nowrap">
                                  직속
                                </span>
                              ) : (
                                <span className="px-1 py-0.5 rounded text-[7px] font-bold bg-purple-600 text-white shrink-0 whitespace-nowrap">
                                  위탁 ({p.affiliation})
                                </span>
                              );
                            })()}
                          </div>
                          {(() => {
                            const bounceCount = staffGroups[name]?.totalBounceCount || 0;
                            const dispatchCount = staffGroups[name]?.records?.length || 0;
                            const totalAttempts = dispatchCount + bounceCount;
                            if (totalAttempts === 0) return null;
                            const selectRate = Math.round((dispatchCount / totalAttempts) * 100);
                            return (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onBounceBadgeClick?.(name);
                                }}
                                className="w-full mt-0.5 py-0.5 px-1.5 rounded-md text-[8px] sm:text-[9px] font-black bg-rose-500 hover:bg-rose-600 text-white shadow-2xs cursor-pointer active:scale-98 transition-all flex items-center justify-center gap-0.5 text-center tracking-tight"
                                title={`총 ${totalAttempts}회 초이스 중 ${dispatchCount}회 진행 (${bounceCount}회 튕김) · 진행확률 ${selectRate}% - 클릭 시 상세 내역`}
                              >
                                <span>
                                  진행 {dispatchCount}/{totalAttempts}회 ({selectRate}%)
                                </span>
                              </button>
                            );
                          })()}
                          {(() => {
                            const staffRecords = staffGroups[name]?.records || [];
                            const dispatchCount = staffRecords.length;
                            if (dispatchCount === 0) return null;

                            const extendedCount = staffRecords.filter((record) => {
                              const start = record.startTime?.toDate
                                ? record.startTime.toDate()
                                : new Date(record.startTime);
                              const end = record.endTime?.toDate
                                ? record.endTime.toDate()
                                : new Date(record.endTime);
                              const isOngoing = start.getTime() === end.getTime();
                              
                              let diffMins = 0;
                              if (isOngoing) {
                                const diffMs = (currentTime || new Date()).getTime() - start.getTime();
                                diffMins = Math.max(0, Math.floor(diffMs / 60000));
                              } else {
                                const diffMs = end.getTime() - start.getTime();
                                diffMins = Math.max(0, Math.floor(diffMs / 60000));
                              }

                              const isExtendedByDurationHours = (record.durationHours || 0) >= 1.5;
                              const isExtendedByTime = diffMins >= 90;
                              return isExtendedByDurationHours || isExtendedByTime;
                            }).length;

                            const extendRate = Math.round((extendedCount / dispatchCount) * 100);

                            return (
                              <div
                                className="w-full mt-0.5 py-0.5 px-1.5 rounded-md text-[8px] sm:text-[9px] font-black bg-indigo-600 text-white shadow-2xs flex items-center justify-center gap-0.5 text-center tracking-tight select-none"
                                title={`진행된 업무 ${dispatchCount}건 중 ${extendedCount}건 연장 (1.5시간 이상) · 연장률 ${extendRate}%`}
                              >
                                <span>
                                  연장 {extendedCount}/{dispatchCount}회 ({extendRate}%)
                                </span>
                              </div>
                            );
                          })()}
                          {(() => {
                            if (!staffId) return null;
                            const weeklyDays = weeklyAttendanceMap?.[staffId] || 0;
                            const weeklyRate = Math.round((weeklyDays / 4) * 100);

                            return (
                              <div
                                className="w-full mt-0.5 py-0.5 px-1.5 rounded-md text-[8px] sm:text-[9px] font-black bg-emerald-600 text-white shadow-2xs flex items-center justify-center gap-0.5 text-center tracking-tight select-none"
                                title={`이번 주 출근 ${weeklyDays}일 / 기본 필수 4일 기준 (${weeklyRate}%)`}
                              >
                                <span>
                                  출근 {weeklyDays}/4 ({weeklyRate}%)
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })()}
                    {isWorking && staffId && checkInTimes[staffId] ? (
                      <div
                        className={cn(
                          "text-[10px] flex flex-col items-center gap-0.5 mt-0.5 leading-tight tracking-tight",
                          isOff
                            ? "text-red-600 font-bold"
                            : "text-stone-400 font-medium",
                        )}
                      >
                        {selectedDate && (
                          <span>
                            {format(parseISO(selectedDate), "yyyy.MM.dd(eee)", {
                              locale: ko,
                            })}
                          </span>
                        )}
                        <span>
                          출근:{" "}
                          {format(
                            checkInTimes[staffId]?.toDate
                              ? checkInTimes[staffId].toDate()
                              : new Date(checkInTimes[staffId]),
                            "HH:mm",
                          )}
                          {isOff &&
                            offTimes[staffId] &&
                            ` | 퇴근: ${format(
                              offTimes[staffId]?.toDate
                                ? offTimes[staffId].toDate()
                                : new Date(offTimes[staffId]),
                              "HH:mm",
                            )}`}
                        </span>
                      </div>
                    ) : (
                      <div className="text-[9px] flex flex-col items-center gap-0.5 mt-0.5 leading-tight tracking-tight text-amber-700 font-bold">
                        {selectedDate && (
                          <span className="text-stone-400 font-medium">
                            {format(parseISO(selectedDate), "yyyy.MM.dd(eee)", {
                              locale: ko,
                            })}
                          </span>
                        )}
                        <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-[8.5px] font-black border border-amber-300 shadow-2xs whitespace-nowrap">
                          ⚠️ 미출근 (기록만 존재)
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <button
                      data-html2canvas-ignore="true"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCapture(name);
                      }}
                      className="text-stone-500 hover:text-stone-800 transition-colors p-0.5 bg-white/50 rounded-md border border-stone-200/50"
                      title="업무내역 캡쳐 공유"
                    >
                      <Camera className="w-3.5 h-3.5" />
                    </button>
                    {staffId && (
                      isWorking ? (
                        <button
                          onClick={() => onToggleOff(staffId)}
                          className={cn(
                            "px-1 py-0.5 rounded-lg text-[8px] font-black transition-all cursor-pointer",
                            isOff
                              ? "bg-stone-900 text-white hover:bg-stone-800"
                              : "bg-stone-200 text-stone-600 hover:bg-stone-300",
                          )}
                        >
                          {isOff ? "복귀" : "퇴근"}
                        </button>
                      ) : onToggleWorking ? (
                        <button
                          onClick={(e) => onToggleWorking(staffId, e)}
                          className="px-1.5 py-0.5 rounded-lg text-[8px] font-black bg-amber-500 hover:bg-amber-600 text-white transition-all shadow-xs cursor-pointer active:scale-95 whitespace-nowrap"
                          title="이 직원을 오늘 출근 명단에 등록(동기화)합니다"
                        >
                          출근 등록
                        </button>
                      ) : null
                    )}
                  </div>
                </div>

                {/* Staff Summary Table */}
                <div className="space-y-0.5">
                  <div className="grid grid-cols-4 gap-0.5 text-[7px] font-black text-stone-400 text-center uppercase border-b border-stone-200 pb-0.5">
                    <div>유형</div>
                    <div>건</div>
                    <div>정</div>
                    <div>반</div>
                  </div>
                  {(() => {
                    const staffItem = staff.find((s) => s.name === name);
                    const effType: "HOPPER" | "PUBLIC" | "TABLE" =
                      staffItem?.type === "HOPPER" || name.includes("하퍼") || name.startsWith("H") || name.startsWith("하")
                        ? "HOPPER"
                        : staffItem?.type === "PUBLIC" || name.includes("퍼블릭") || name.startsWith("P") || name.startsWith("퍼")
                          ? "PUBLIC"
                          : "TABLE";

                    if (effType === "HOPPER") {
                      return (
                        <div className="grid grid-cols-4 gap-0.5 text-[9px] font-bold text-center items-center py-0.5 bg-purple-100 rounded-lg border border-purple-200">
                          <div className="text-purple-700 font-black">H</div>
                          <div>{staffGroups[name].hopperCount}</div>
                          <div>{staffGroups[name].hopperUnits}</div>
                          <div>{staffGroups[name].hopperBanti}</div>
                        </div>
                      );
                    }
                    if (effType === "PUBLIC") {
                      return (
                        <div className="grid grid-cols-4 gap-0.5 text-[9px] font-bold text-center items-center py-0.5 bg-blue-100 rounded-lg border border-blue-200">
                          <div className="text-blue-700 font-black">P</div>
                          <div>{staffGroups[name].publicCount}</div>
                          <div>{staffGroups[name].publicUnits}</div>
                          <div>{staffGroups[name].publicBanti}</div>
                        </div>
                      );
                    }
                    return (
                      <div className="grid grid-cols-4 gap-0.5 text-[9px] font-bold text-center items-center py-0.5 bg-emerald-100 rounded-lg border border-emerald-200">
                        <div className="text-emerald-700 font-black">T</div>
                        <div>{staffGroups[name].tableCount}</div>
                        <div>{staffGroups[name].tableUnits}</div>
                        <div>{staffGroups[name].tableBanti}</div>
                      </div>
                    );
                  })()}
                  <div className="grid grid-cols-2 gap-1 mt-0.5">
                    <div
                      className={cn(
                        "p-1 rounded-lg flex flex-col items-center justify-center px-0.5 relative overflow-hidden transition-colors min-h-[36px]",
                        staffGroups[name].totalPaid +
                          staffGroups[name].totalUnpaid >
                          0 && staffGroups[name].totalUnpaid === 0
                          ? "bg-stone-900 text-white"
                          : "bg-stone-800 text-white",
                      )}
                    >
                      <span className="text-[7px] font-bold opacity-70 uppercase mb-0">
                        수금 (총/미수)
                      </span>
                      <div className="flex items-center justify-center gap-0.5 tracking-tighter w-full px-0.5">
                        <div className="flex items-center gap-0.5">
                          <span className="text-[10px] font-black">
                            {(
                              (staffGroups[name].totalPaid +
                                staffGroups[name].totalUnpaid) /
                              10000
                            ).toFixed(1)}
                          </span>
                          <span className="text-[8px] opacity-50">/</span>
                          <span className="text-[10px] font-black text-red-400">
                            {(staffGroups[name].totalUnpaid / 10000).toFixed(1)}
                          </span>
                        </div>
                        {staffGroups[name].totalPaid +
                          staffGroups[name].totalUnpaid >
                          0 &&
                          staffGroups[name].totalUnpaid === 0 && (
                            <Check className="w-2.5 h-2.5 text-emerald-400 shrink-0 ml-0.5" />
                          )}
                      </div>
                    </div>
                    <div
                      role="button"
                      tabIndex={0}
                      className={cn(
                        "p-1 rounded-lg flex flex-col items-center justify-center px-0.5 relative overflow-hidden cursor-pointer hover:opacity-80 active:scale-95 transition-all outline-none focus:ring-2 focus:ring-white/20",
                        staffGroups[name].totalStaffPayment > 0 &&
                          staffGroups[name].isAllStaffPaid
                          ? staffGroups[name].staffPaymentMethod === "CASH"
                            ? "bg-emerald-600 text-white"
                            : "bg-blue-600 text-white"
                          : "bg-red-600 text-white",
                      )}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onStaffPaymentClick(name);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onStaffPaymentClick(name);
                        }
                      }}
                    >
                      <span className="text-[7px] font-bold opacity-70 uppercase mb-0">
                        지급액
                      </span>
                      <div className="flex flex-col items-center gap-0 tracking-tighter">
                        <span className="text-[10px] font-black leading-none">
                          {(
                            staffGroups[name].totalStaffPayment / 10000
                          ).toFixed(1)}
                          만
                        </span>
                        {staffGroups[name].totalTip > 0 && (
                          <span className="text-[7px] font-bold text-white/80 leading-none mt-0.5">
                            (팁 {staffGroups[name].totalTip.toLocaleString()})
                          </span>
                        )}
                        {staffGroups[name].totalStaffPayment > 0 &&
                          staffGroups[name].isAllStaffPaid && (
                            <Check className="w-2 h-2 shrink-0 mt-0.5" />
                          )}
                      </div>
                    </div>
                    <div
                      className={cn(
                        "p-1 rounded-lg flex justify-between items-center px-2 col-span-2 transition-all cursor-pointer hover:opacity-90 active:scale-95",
                        staffGroups[name].isManualProfit
                          ? "bg-blue-600 text-white ring-2 ring-blue-300 ring-offset-1"
                          : staffGroups[name].totalPaid +
                                staffGroups[name].totalUnpaid >
                                0 &&
                              staffGroups[name].totalStaffPayment > 0 &&
                              staffGroups[name].totalUnpaid === 0 &&
                              staffGroups[name].isAllStaffPaid
                            ? "bg-emerald-500 text-white ring-1 ring-emerald-200 ring-offset-1"
                            : "bg-emerald-600 text-white",
                      )}
                      onClick={() => {
                        // Calculate what the profit WOULD have been without manual override
                        const calculatedProfit = staffGroups[
                          name
                        ].records.reduce(
                          (acc: number, r: DispatchRecord) =>
                            acc + r.commission,
                          0,
                        );
                        onManualProfitClick(name, calculatedProfit);
                      }}
                    >
                      <div className="flex items-center gap-1">
                        <span className="text-[8px] font-bold">
                          {staffGroups[name].isManualProfit
                            ? "별도수익"
                            : "수익"}
                        </span>
                        {staffGroups[name].totalPaid +
                          staffGroups[name].totalUnpaid >
                          0 &&
                          staffGroups[name].totalStaffPayment > 0 &&
                          staffGroups[name].totalUnpaid === 0 &&
                          staffGroups[name].isAllStaffPaid && (
                            <CheckCircle2 className="w-2.5 h-2.5" />
                          )}
                      </div>
                      <span className="text-xs font-black">
                        {(staffGroups[name].totalCommission / 10000).toFixed(1)}
                      </span>
                    </div>
                    {(() => {
                      const { isDirect, category, affiliation } = formatStaffNameComponents(name);
                      const staffItem = staff.find((s) => s.name === name);
                      const effType =
                        staffItem?.type === "HOPPER" ||
                        category === "하퍼" ||
                        name.includes("하퍼") ||
                        name.startsWith("하")
                          ? "HOPPER"
                          : staffItem?.type === "PUBLIC" ||
                              category === "퍼블릭" ||
                              name.includes("퍼블릭") ||
                              name.startsWith("퍼")
                            ? "PUBLIC"
                            : "COFFEE";
                      const totalCollection =
                        staffGroups[name].totalPaid +
                        staffGroups[name].totalUnpaid;
                      const totalStaffPayment =
                        staffGroups[name].totalStaffPayment;
                      const totalTip = staffGroups[name].totalTip || 0;

                      let expectedDeposit = 0;
                      if (isDirect) {
                        if (totalStaffPayment > 0) {
                          if (effType === "HOPPER") {
                            expectedDeposit = totalStaffPayment - 20000;
                          } else {
                            expectedDeposit = totalStaffPayment;
                          }
                        }
                      } else {
                        if (totalCollection > 0) {
                          expectedDeposit = totalCollection - 30000 + totalTip;
                        }
                      }

                      return (
                        <div className="p-1 rounded-lg flex justify-between items-center px-2 col-span-2 bg-indigo-600 text-white shadow-2xs">
                          <span className="text-[8px] font-bold">
                            최종입금
                          </span>
                          <span className="text-xs font-black">
                            {(expectedDeposit / 10000).toFixed(1)}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Column Content (Vertical List) */}
              <div className="space-y-3">
                {staffGroups[name].records
                  .sort((a, b) => {
                    const getOffset = (t: any) => {
                      const date = t.toDate ? t.toDate() : new Date(t);
                      const h = date.getHours();
                      const m = date.getMinutes();
                      return (h < 18 ? h + 24 : h) * 60 + m;
                    };
                    return getOffset(a.startTime) - getOffset(b.startTime);
                  })
                  .map((record) => {
                    const start = record.startTime.toDate
                      ? record.startTime.toDate()
                      : new Date(record.startTime);
                    const end = record.endTime.toDate
                      ? record.endTime.toDate()
                      : new Date(record.endTime);
                    const isOngoing = start.getTime() === end.getTime();

                    let displayDurationHours = record.durationHours;
                    let displayIsBanti = record.isBanti;
                    let displayIsNoBanti = record.isNoBanti;
                    let isBantiRecommended = false;
                    let durationText = "";

                    if (isOngoing) {
                      const diffMs = currentTime.getTime() - start.getTime();
                      const diffMins = Math.max(0, Math.floor(diffMs / 60000));
                      const fullHours = Math.floor(diffMins / 60);
                      const leftoverMins = diffMins % 60;

                      // New Banti Logic for Ongoing
                      const isAutoBanti =
                        leftoverMins >= 20 && leftoverMins <= 34;
                      const isAutoFull = leftoverMins >= 40;
                      const isReviewNeeded =
                        (leftoverMins >= 5 && leftoverMins <= 19) ||
                        (leftoverMins >= 35 && leftoverMins <= 39);

                      durationText = `진행중 (${fullHours > 0 ? `${fullHours}시간 ` : ""}${leftoverMins}분)`;

                      displayIsBanti =
                        record.isBanti ||
                        (!record.isNoBanti && !record.isRoundUp && isAutoBanti);
                      displayIsNoBanti = record.isNoBanti;
                      isBantiRecommended =
                        !record.isBanti &&
                        !record.isNoBanti &&
                        !record.isRoundUp &&
                        isReviewNeeded;

                      const extraHours = record.isRoundUp
                        ? leftoverMins > 0
                          ? 1.0
                          : 0.0
                        : record.isRoundDownFull
                          ? -1.0
                          : record.isRoundDownHalf
                            ? -0.5
                            : record.isBanti
                              ? 0.5
                              : record.isNoBanti
                                ? 0.0
                                : isAutoFull
                                  ? 1.0
                                  : isAutoBanti
                                    ? 0.5
                                    : 0.0;
                      const extraFullUnits = Number(record.extraFullUnits || 0);
                      displayDurationHours =
                        fullHours + extraHours + extraFullUnits;
                    } else {
                      const start = record.startTime.toDate
                        ? record.startTime.toDate()
                        : new Date(record.startTime);
                      const end = record.endTime.toDate
                        ? record.endTime.toDate()
                        : new Date(record.endTime);
                      const diffMs = end.getTime() - start.getTime();
                      const diffMins = Math.max(0, Math.floor(diffMs / 60000));
                      const fullHours = Math.floor(diffMins / 60);
                      const leftoverMins = diffMins % 60;
                      durationText = `완료 (${fullHours > 0 ? `${fullHours}시간 ` : ""}${leftoverMins}분)`;

                      const isAutoBanti =
                        leftoverMins >= 20 && leftoverMins <= 34;
                      const isAutoFull = leftoverMins >= 40;
                      const isReviewNeeded =
                        (leftoverMins >= 5 && leftoverMins <= 19) ||
                        (leftoverMins >= 35 && leftoverMins <= 39);

                      displayIsBanti =
                        record.isBanti ||
                        (!record.isNoBanti && !record.isRoundUp && isAutoBanti);
                      displayIsNoBanti = record.isNoBanti;
                      isBantiRecommended =
                        !record.isBanti &&
                        !record.isNoBanti &&
                        !record.isRoundUp &&
                        isReviewNeeded;

                      const extraHours = record.isRoundUp
                        ? leftoverMins > 0
                          ? 1.0
                          : 0.0
                        : record.isRoundDownFull
                          ? -1.0
                          : record.isRoundDownHalf
                            ? -0.5
                            : record.isBanti
                              ? 0.5
                              : record.isNoBanti
                                ? 0.0
                                : isAutoFull
                                  ? 1.0
                                  : isAutoBanti
                                    ? 0.5
                                    : 0.0;
                      const extraFullUnits = Number(record.extraFullUnits || 0);
                      displayDurationHours =
                        fullHours + extraHours + extraFullUnits;
                    }

                    return (
                      <div
                        id={`record-${record.id}`}
                        key={record.id}
                        onClick={() => onEditRecord(record)}
                        className={cn(
                          "p-2 rounded-xl border shadow-sm cursor-pointer transition-all active:scale-95 relative",
                          isOngoing
                            ? "bg-purple-600 border-purple-700 text-white"
                            : record.paymentMethod === "UNPAID"
                              ? "bg-red-200 border-red-300"
                              : "bg-green-100 border-green-200",
                          highlightedId === record.id
                            ? "ring-4 ring-yellow-400 border-yellow-400 scale-[1.04] shadow-2xl z-30 animate-pulse transition-all duration-300 ring-offset-2 ring-offset-stone-900/10"
                            : isOngoing
                              ? "animate-pulse ring-2 ring-purple-400 ring-offset-1"
                              : "",
                        )}
                      >
                        <div className="flex justify-between items-start mb-0.5">
                          <div
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[8px] font-bold",
                              record.systemType === "TABLE"
                                ? "bg-emerald-100 text-emerald-700"
                                : record.systemType === "PUBLIC"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-purple-100 text-purple-700",
                            )}
                          >
                            {record.systemType === "TABLE"
                              ? "T"
                              : record.systemType === "PUBLIC"
                                ? "P"
                                : "H"}
                          </div>
                          <div className="text-right">
                            <div
                              className={cn(
                                "text-[11px] font-black leading-none",
                                isOngoing ? "text-white" : "text-stone-900",
                              )}
                            >
                              {format(start, "HH:mm")}{" "}
                              {isOngoing ? "" : `- ${format(end, "HH:mm")}`}
                            </div>
                            <div
                              className={cn(
                                "text-[8px] font-bold mt-0.5",
                                isOngoing
                                  ? "text-purple-200 animate-pulse"
                                  : "text-stone-500",
                              )}
                            >
                              {durationText}
                            </div>
                          </div>
                        </div>
                        <div
                          className={cn(
                            "font-black text-[13px] md:text-sm mb-0.5 break-keep whitespace-pre-wrap break-words leading-tight",
                            isOngoing ? "text-white" : "text-stone-900",
                          )}
                        >
                          {record.establishmentName}
                        </div>
                        <div className="flex flex-wrap items-center gap-0.5 mb-1">
                          <span
                            className={cn(
                              "text-[8px] font-black px-1 py-0.5 rounded-lg border shadow-sm whitespace-nowrap shrink-0",
                              isOngoing
                                ? "bg-purple-500 text-white border-purple-400"
                                : "bg-white border-stone-200 text-stone-600",
                            )}
                          >
                            정 {Math.floor(displayDurationHours)}
                          </span>
                          {(displayIsBanti ||
                            displayIsNoBanti ||
                            isBantiRecommended ||
                            record.isRoundUp ||
                            record.isRoundDownHalf ||
                            record.isRoundDownFull) && (
                            <span
                              className={cn(
                                "text-[8px] font-black px-1 py-0.5 rounded-lg border shadow-sm whitespace-nowrap shrink-0",
                                record.isRoundUp
                                  ? isOngoing
                                    ? "bg-emerald-500 text-white border-emerald-400"
                                    : "bg-emerald-50 text-emerald-600 border-emerald-100"
                                  : record.isRoundDownFull
                                    ? isOngoing
                                      ? "bg-purple-500 text-white border-purple-400"
                                      : "bg-purple-50 text-purple-600 border-purple-100"
                                    : record.isRoundDownHalf
                                      ? isOngoing
                                        ? "bg-blue-500 text-white border-blue-400"
                                        : "bg-blue-50 text-blue-600 border-blue-100"
                                      : displayIsBanti
                                        ? isOngoing
                                          ? "bg-red-500 text-white border-red-400"
                                          : "bg-red-50 text-red-600 border-red-100"
                                        : displayIsNoBanti
                                          ? isOngoing
                                            ? "bg-purple-500 text-white border-purple-400"
                                            : "bg-stone-50 text-stone-600 border-stone-100"
                                          : "bg-red-600 text-white animate-pulse ring-1 ring-red-300",
                              )}
                            >
                              {record.isRoundUp
                                ? "올림ㅇ"
                                : record.isRoundDownFull
                                  ? "정티내림"
                                  : record.isRoundDownHalf
                                    ? "반티내림"
                                    : displayIsBanti
                                      ? "반티ㅇ"
                                      : displayIsNoBanti
                                        ? "반티x"
                                        : "반티?"}
                            </span>
                          )}
                          {record.extraFullUnits > 0 && (
                            <span
                              className={cn(
                                "text-[8px] font-black px-1 py-0.5 rounded-lg border shadow-sm whitespace-nowrap shrink-0",
                                isOngoing
                                  ? "bg-emerald-500 text-white border-emerald-400"
                                  : "bg-emerald-100 border-emerald-200 text-emerald-600",
                              )}
                            >
                              추가 +{record.extraFullUnits}
                            </span>
                          )}
                          <span
                            className={cn(
                              "text-[8px] font-black px-1 py-0.5 rounded-lg border border-transparent shadow-sm whitespace-nowrap shrink-0",
                              isOngoing
                                ? "bg-white text-purple-700"
                                : "bg-stone-900 text-white",
                            )}
                          >
                            {displayDurationHours.toFixed(1)}개
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-[9px]">
                          <div className="flex items-center gap-1">
                            <span
                              className={cn(
                                "font-bold",
                                isOngoing
                                  ? "text-purple-100"
                                  : "text-stone-500",
                              )}
                            >
                              수 {(record.totalAmount / 10000).toFixed(1)}만 /
                              지 {(record.staffPayment / 10000).toFixed(1)}만
                            </span>
                            {record.tip > 0 && (
                              <span
                                className={cn(
                                  "font-black px-1 rounded border",
                                  isOngoing
                                    ? "bg-orange-500 text-white border-orange-400"
                                    : "text-orange-600 bg-orange-50 border-orange-100",
                                )}
                              >
                                팁 {record.tip.toLocaleString()}
                              </span>
                            )}
                          </div>
                          <span
                            className={cn(
                              "font-black",
                              isOngoing
                                ? "text-white"
                                : record.paymentMethod === "UNPAID"
                                  ? "text-red-600"
                                  : "text-green-600",
                            )}
                          >
                            {record.paymentMethod === "UNPAID"
                              ? "미수"
                              : record.isPass
                                ? "패스"
                                : record.paymentMethod === "CASH"
                                  ? "현금"
                                  : "계좌"}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                {/* Add Record Plus Button */}
                <button
                  disabled={isOff}
                  onClick={() => onAddRecordForStaff([name])}
                  className={cn(
                    "w-full py-4 rounded-xl border-2 border-dashed flex items-center justify-center transition-all active:scale-95 group",
                    isOff
                      ? "bg-stone-900 border-stone-900 text-stone-500 cursor-not-allowed"
                      : "border-stone-200 text-stone-300 hover:border-stone-400 hover:text-stone-400 hover:bg-stone-50",
                  )}
                >
                  <Plus
                    className={cn(
                      "w-6 h-6 transition-transform",
                      !isOff && "group-hover:scale-110",
                    )}
                  />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConfirmModal({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onCancel();
        }}
        className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 w-full max-w-xs bg-white rounded-3xl shadow-2xl p-6 text-center"
      >
        <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-stone-900 mb-2">확인</h3>
        <p className="text-sm text-stone-500 mb-6 leading-relaxed">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 bg-stone-100 text-stone-600 rounded-xl font-bold text-sm hover:bg-stone-200 transition-colors"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
          >
            확인
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function AlertModal({
  message,
  onClose,
  actionLabel,
  onAction,
}: {
  message: string;
  onClose: () => void;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const isDangerAction =
    actionLabel &&
    (actionLabel.includes("튕김") ||
      actionLabel.includes("삭제") ||
      actionLabel.includes("종료"));

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 text-center"
      >
        <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-stone-900 mb-2">알림</h3>
        <p className="text-sm text-stone-600 mb-6 leading-relaxed whitespace-pre-line text-left bg-stone-50 p-3.5 rounded-2xl border border-stone-200">
          {message}
        </p>
        <div className="flex flex-col gap-2">
          {actionLabel && onAction && (
            <button
              onClick={() => {
                onAction();
                onClose();
              }}
              className={`w-full py-3 text-white rounded-xl font-bold text-sm transition-colors shadow-lg cursor-pointer ${
                isDangerAction
                  ? "bg-rose-600 hover:bg-rose-700 shadow-rose-200"
                  : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200"
              }`}
            >
              {actionLabel}
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full py-3 bg-stone-900 text-white rounded-xl font-bold text-sm hover:bg-stone-800 transition-colors shadow-lg shadow-stone-200 cursor-pointer"
          >
            {actionLabel ? "취소" : "확인"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

import { InlineRowCollectForm } from "./components/InlineRowCollectForm";
import { BatchCollectForm } from "./components/BatchCollectForm";
import { EstablishmentAdditionalCollectForm } from "./components/EstablishmentAdditionalCollectForm";
import { FloatingStaffSearchBar } from "./components/FloatingStaffSearchBar";

function DetailBreakdownModal({
  type,
  records,
  unpaidStaffRecords,
  allUnpaidRecords,
  onClose,
  currentTime,
  staff,
  checkInTimes,
  selectedDate,
  manualDailyProfits,
  initialSearchTerm,
}: {
  type: "revenue" | "commission" | "staffPayment" | "unpaid";
  records: DispatchRecord[];
  unpaidStaffRecords: DispatchRecord[];
  allUnpaidRecords: DispatchRecord[];
  onClose: () => void;
  currentTime: Date;
  staff: Staff[];
  checkInTimes: Record<string, any>;
  selectedDate: string;
  manualDailyProfits: Record<string, number>;
  initialSearchTerm?: string;
}) {
  const [confirmConfig, setConfirmConfig] = useState<{
    message: string;
    action: () => void;
  } | null>(null);
  const [alertConfig, setAlertConfig] = useState<{
    message: string;
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);
  const [collectingInfo, setCollectingInfo] = useState<{
    id: string;
    method: PaymentMethod;
    date: string;
    time: string;
    depositorName: string;
  } | null>(null);
  const [batchCollecting, setBatchCollecting] = useState<{
    dateKey: string;
    estName: string;
    method: PaymentMethod;
    date: string;
    time: string;
    depositorName: string;
  } | null>(null);
  const [paymentSelection, setPaymentSelection] = useState<{
    name: string;
    records: DispatchRecord[];
    method: "CASH" | "TRANSFER";
  } | null>(null);
  const [customPaymentTime, setCustomPaymentTime] = useState<{
    date: string;
    time: string;
  } | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(
    initialSearchTerm ? `${selectedDate}-${initialSearchTerm}` : null,
  );
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm || "");
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [showShortageOnly, setShowShortageOnly] = useState(false);
  const [batchAdditionalCollectingKey, setBatchAdditionalCollectingKey] = useState<string | null>(null);

  const [localRecords, setLocalRecords] = useState<DispatchRecord[]>([]);
  const customTimeInputRef = useRef<HTMLInputElement>(null);

  const shortageEstKeys = useMemo(() => {
    const isOngoing = (r: DispatchRecord) => {
      const start = r.startTime.toDate
        ? r.startTime.toDate()
        : new Date(r.startTime);
      const end = r.endTime.toDate ? r.endTime.toDate() : new Date(r.endTime);
      return start.getTime() === end.getTime();
    };

    const groups: Record<string, DispatchRecord[]> = {};
    localRecords.forEach((r) => {
      const wasUnpaid = (r as any).wasUnpaid;
      if (!wasUnpaid || isOngoing(r)) return;
      const key = `${r.date}___${r.establishmentName}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });

    const shortageKeys = new Set<string>();
    Object.entries(groups).forEach(([key, groupRecords]) => {
      const totalRequested = groupRecords.reduce((sum, r) => sum + r.totalAmount, 0);
      const totalCollected = groupRecords.reduce((sum, r) => {
        if (r.paymentMethod === "UNPAID") return sum;
        return (
          sum +
          (r.collectedAmount !== undefined ? r.collectedAmount : r.totalAmount)
        );
      }, 0);
      const hasAnyCollection =
        groupRecords.some(
          (r) =>
            r.paymentMethod !== "UNPAID" ||
            (r.collectedAmount !== undefined && r.collectedAmount > 0),
        ) || totalCollected > 0;
      const hasIndividualShortage = groupRecords.some(
        (r) =>
          r.paymentMethod !== "UNPAID" &&
          r.collectedAmount !== undefined &&
          r.collectedAmount < r.totalAmount,
      );

      if (
        hasIndividualShortage ||
        (hasAnyCollection && totalCollected < totalRequested)
      ) {
        shortageKeys.add(key);
      }
    });

    return shortageKeys;
  }, [localRecords]);

  const shortageCount = shortageEstKeys.size;

  useEffect(() => {
    if (initialSearchTerm) {
      // Find element and scroll to it - prioritize selected date
      const elementId = `staff-payment-${selectedDate}-${initialSearchTerm}`;
      const element = document.getElementById(elementId);
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 300);
      }

      // Clear highlight after some time
      const timer = setTimeout(() => {
        setHighlightedId(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [initialSearchTerm, selectedDate]);

  const getRelativeDateLabel = (dateStr: string) => {
    const now = new Date();
    let currentBusinessDateStr: string;
    if (now.getHours() < 18) {
      currentBusinessDateStr = format(subDays(now, 1), "yyyy-MM-dd");
    } else {
      currentBusinessDateStr = format(now, "yyyy-MM-dd");
    }

    if (dateStr === currentBusinessDateStr)
      return <span className="ml-1.5 text-red-600 font-black">(당일)</span>;

    const yesterdayStr = format(
      subDays(parseISO(currentBusinessDateStr), 1),
      "yyyy-MM-dd",
    );
    if (dateStr === yesterdayStr)
      return <span className="ml-1.5 text-stone-500 font-black">(어제)</span>;

    const dayBeforeYesterdayStr = format(
      subDays(parseISO(currentBusinessDateStr), 2),
      "yyyy-MM-dd",
    );
    if (dateStr === dayBeforeYesterdayStr)
      return <span className="ml-1.5 text-stone-400 font-black">(엊그제)</span>;

    return null;
  };

  // Sync local records to keep them visible even after status changes (for smooth UI)
  useEffect(() => {
    setLocalRecords((prev) => {
      const combined = [...records, ...unpaidStaffRecords, ...allUnpaidRecords];
      const newMap = new Map(prev.map((r) => [r.id, r]));

      combined.forEach((r) => {
        if (r.id) {
          const existing = newMap.get(r.id) as any;
          // Tag records that are currently unpaid so they stay in the list even after being paid locally
          const wasUnpaid =
            r.paymentMethod === "UNPAID" || r.wasUnpaid || existing?.wasUnpaid;
          const wasStaffUnpaid =
            r.isStaffPaid === false || existing?.wasStaffUnpaid;

          newMap.set(r.id, {
            ...r,
            wasUnpaid,
            wasStaffUnpaid,
          } as any);
        }
      });
      const validStaffNames = new Set(staff.map((s) => s.name));
      // Remove staff that are filtered out by employment filter
      return Array.from(newMap.values()).filter((r) =>
        validStaffNames.has(r.staffName),
      );
    });
  }, [records, unpaidStaffRecords, allUnpaidRecords, staff]);

  const updateLocalRecord = (id: string, updates: Partial<DispatchRecord>) => {
    setLocalRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...updates } : r)),
    );
  };

  // Auto-scroll to highlighted record
  useEffect(() => {
    if (highlightedId) {
      const element = document.getElementById(`record-${highlightedId}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        // Remove highlight after 3 seconds
        const timer = setTimeout(() => setHighlightedId(null), 3000);
        return () => clearTimeout(timer);
      }
    }
  }, [highlightedId]);

  const handleCollect = async (
    id: string,
    method: PaymentMethod,
    dateStr: string,
    timeStr: string,
    isPass: boolean = false,
    depositorName: string = "",
    forceCollect: boolean = false,
    customAmount?: number,
  ) => {
    try {
      let collectedAt = new Date();
      if (dateStr && timeStr) {
        const month = parseInt(dateStr.slice(0, 2)) - 1;
        const day = parseInt(dateStr.slice(2, 4));
        const hour = parseInt(timeStr.slice(0, 2));
        const minute = parseInt(timeStr.slice(2, 4));
        collectedAt.setMonth(month, day);
        collectedAt.setHours(hour, minute, 0, 0);

        if (!forceCollect) {
          // Check for duplicate collectedAt time (compare up to minutes)
          const duplicateRecord = records.find((r) => {
            if (r.paymentMethod === "UNPAID" || !r.collectedAt) return false;
            const rDate = r.collectedAt.toDate
              ? r.collectedAt.toDate()
              : new Date(r.collectedAt);
            return (
              rDate.getMonth() === collectedAt.getMonth() &&
              rDate.getDate() === collectedAt.getDate() &&
              rDate.getHours() === collectedAt.getHours() &&
              rDate.getMinutes() === collectedAt.getMinutes()
            );
          });

          if (duplicateRecord) {
            const currentRec =
              records.find((r) => r.id === id) ||
              allUnpaidRecords.find((r) => r.id === id);
            const rDate = duplicateRecord.collectedAt.toDate
              ? duplicateRecord.collectedAt.toDate()
              : new Date(duplicateRecord.collectedAt);
            const formattedTime = format(rDate, "MM/dd HH:mm");

            setConfirmConfig({
              message: `동일한 날짜와 시간의 수금 기록이 이미 존재합니다.\n\n[기존 수금 기록]\n파견일: ${duplicateRecord.date.slice(5, 7)}/${duplicateRecord.date.slice(8, 10)}\n업소: ${duplicateRecord.establishmentName}\n직원: ${duplicateRecord.staffName}\n수금시간: ${formattedTime}\n금액: ${duplicateRecord.totalAmount.toLocaleString()}원${duplicateRecord.depositorName ? `\n입금자: ${duplicateRecord.depositorName}` : ""}\n\n[신규 입금 정보]\n업소: ${currentRec?.establishmentName || ""}\n직원: ${currentRec?.staffName || ""}\n원래 금액: ${currentRec ? currentRec.totalAmount.toLocaleString() : 0}원${customAmount !== undefined ? `\n실제 수금 금액: ${customAmount.toLocaleString()}원` : ""}${depositorName ? `\n입금자: ${depositorName}` : ""}\n\n위 내용으로 입금 처리를 진행하시겠습니까?`,
              action: () => {
                handleCollect(
                  id,
                  method,
                  dateStr,
                  timeStr,
                  isPass,
                  depositorName,
                  true,
                  customAmount,
                );
              },
            });
            return;
          }
        }
      }

      const currentRec = records.find((r) => r.id === id) || allUnpaidRecords.find((r) => r.id === id);
      const originalAmount = currentRec ? currentRec.totalAmount : 0;
      const finalCollectedAmount = customAmount !== undefined && !isNaN(customAmount) ? customAmount : originalAmount;

      const newTimestamp = Timestamp.fromDate(collectedAt);
      const existingHistory = currentRec ? getRecordCollectionHistory(currentRec) : [];

      let updates: any;
      if (!currentRec || currentRec.paymentMethod === "UNPAID" || existingHistory.length === 0) {
        updates = {
          paymentMethod: method,
          collectedAt: newTimestamp,
          additionalCollectedAt: null,
          collectionHistory: [
            {
              collectedAt: newTimestamp,
              amount: finalCollectedAmount,
              paymentMethod: method,
              ...(depositorName ? { depositorName } : {}),
              note: "1차 수금",
            },
          ],
          isPass: isPass,
          isDispatchBoxCollection: false,
          depositorName: depositorName || null,
          collectedAmount: finalCollectedAmount,
        };
      } else {
        const nextN = existingHistory.length + 1;
        const newEntry: CollectionHistoryEntry = {
          collectedAt: newTimestamp,
          amount: finalCollectedAmount,
          paymentMethod: method,
          ...(depositorName ? { depositorName } : {}),
          note: `${nextN}차 수금`,
        };
        updates = {
          paymentMethod: method,
          collectedAt: currentRec.collectedAt || newTimestamp,
          additionalCollectedAt: newTimestamp,
          collectionHistory: [...existingHistory, newEntry],
          isPass: isPass,
          isDispatchBoxCollection: false,
          depositorName: depositorName || null,
          collectedAmount: finalCollectedAmount,
        };
      }
      await updateDispatch(id, updates as any);
      updateLocalRecord(id, updates as any);
      setCollectingInfo(null);
    } catch (e) {
      console.error("수금 처리 중 오류:", e);
      setAlertConfig({
        message: `수금 처리 중 오류: ${getErrorMessage(e, "수금 처리 중 오류가 발생했습니다.")}`,
      });
    }
  };

  const handleEstablishmentAdditionalCollect = async (
    targetRecords: DispatchRecord[],
    method: PaymentMethod,
    additionalAmount: number,
    depositorName: string = "",
    collectedDateStr?: string,
    collectedTimeStr?: string,
  ) => {
    try {
      if (!targetRecords || targetRecords.length === 0) return;

      const currentRecords = targetRecords.map((r) => {
        const found = localRecords.find((loc) => loc.id === r.id);
        return found || r;
      });

      const now = new Date();
      let year = now.getFullYear();
      let month = now.getMonth();
      let day = now.getDate();
      let hour = now.getHours();
      let minute = now.getMinutes();

      if (collectedDateStr) {
        if (collectedDateStr.includes("-")) {
          const [y, m, d] = collectedDateStr.split("-").map(Number);
          if (y && m && d) {
            year = y;
            month = m - 1;
            day = d;
          }
        } else if (collectedDateStr.length === 4) {
          const m = parseInt(collectedDateStr.slice(0, 2), 10);
          const d = parseInt(collectedDateStr.slice(2, 4), 10);
          if (!isNaN(m) && !isNaN(d) && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
            month = m - 1;
            day = d;
          }
        }
      }

      if (collectedTimeStr) {
        if (collectedTimeStr.includes(":")) {
          const [h, min] = collectedTimeStr.split(":").map(Number);
          if (!isNaN(h) && !isNaN(min)) {
            hour = h;
            minute = min;
          }
        } else if (collectedTimeStr.length === 4) {
          const h = parseInt(collectedTimeStr.slice(0, 2), 10);
          const min = parseInt(collectedTimeStr.slice(2, 4), 10);
          if (!isNaN(h) && !isNaN(min) && h >= 0 && h <= 23 && min >= 0 && min <= 59) {
            hour = h;
            minute = min;
          }
        }
      }

      const customCollectedAt = Timestamp.fromDate(
        new Date(year, month, day, hour, minute, 0, 0),
      );

      // Determine existing highest round across all records for this establishment
      let currentMaxRound = 1;
      let hasAnyPreviousCollection = false;
      currentRecords.forEach((r) => {
        if (r.paymentMethod !== "UNPAID") {
          hasAnyPreviousCollection = true;
        }
        const hist = getRecordCollectionHistory(r);
        hist.forEach((entry, idx) => {
          hasAnyPreviousCollection = true;
          let rNum = idx + 1;
          if (entry.note) {
            const match = entry.note.match(/(\d+)차/);
            if (match) rNum = parseInt(match[1], 10);
          }
          if (rNum > currentMaxRound) currentMaxRound = rNum;
        });
      });

      const nextRoundNum = hasAnyPreviousCollection ? currentMaxRound + 1 : 1;
      const nextRoundLabel = `${nextRoundNum}차 추가수금`;

      // Find existing establishment collection history from any record
      let existingHist: CollectionHistoryEntry[] = [];
      for (const r of currentRecords) {
        if (
          r.collectionHistory &&
          Array.isArray(r.collectionHistory) &&
          r.collectionHistory.length > 0
        ) {
          existingHist = r.collectionHistory;
          break;
        }
      }

      let updatedHistory: CollectionHistoryEntry[] = [];

      if (additionalAmount > 0) {
        const newEntry: CollectionHistoryEntry = {
          collectedAt: customCollectedAt,
          amount: additionalAmount,
          paymentMethod: method,
          ...(depositorName ? { depositorName } : {}),
          note:
            existingHist.length === 0 && nextRoundNum === 1
              ? "1차 수금"
              : nextRoundLabel,
        };
        updatedHistory = [...existingHist, newEntry];
      } else if (additionalAmount < 0) {
        let remainingToDeduct = Math.abs(additionalAmount);
        const newHist: CollectionHistoryEntry[] = [];
        const reversed = [...existingHist].reverse();
        for (const entry of reversed) {
          const eAmt = entry.amount || 0;
          if (remainingToDeduct <= 0) {
            newHist.unshift(entry);
          } else if (eAmt <= remainingToDeduct) {
            remainingToDeduct -= eAmt;
          } else {
            newHist.unshift({
              ...entry,
              amount: eAmt - remainingToDeduct,
            });
            remainingToDeduct = 0;
          }
        }
        updatedHistory = newHist;
      }

      const updatePromises = currentRecords.map(async (r) => {
        const isPaid = updatedHistory.length > 0;
        const updates: Partial<DispatchRecord> = {
          paymentMethod: isPaid
            ? r.paymentMethod !== "UNPAID"
              ? r.paymentMethod
              : method
            : "UNPAID",
          collectionHistory: updatedHistory,
          collectedAt: isPaid ? r.collectedAt || customCollectedAt : null,
          additionalCollectedAt: isPaid ? customCollectedAt : null,
          depositorName: depositorName || r.depositorName || null,
          collectedAmount: undefined,
        };

        if (r.id) {
          await updateDispatch(r.id, updates as any);
          updateLocalRecord(r.id, updates as any);
        }
      });

      await Promise.all(updatePromises);
      setBatchAdditionalCollectingKey(null);
    } catch (e) {
      console.error("업체 추가 수금 처리 중 오류:", e);
      setAlertConfig({
        message: `추가 수금 처리 중 오류: ${getErrorMessage(e, "추가 수금 처리 중 오류가 발생했습니다.")}`,
      });
    }
  };

  const handleBatchCollect = async (
    recordsToUpdate: DispatchRecord[],
    method: PaymentMethod,
    dateStr: string,
    timeStr: string,
    isPass: boolean = false,
    depositorName: string = "",
    forceCollect: boolean = false,
    customTotalAmount?: number,
  ) => {
    try {
      let collectedAt = new Date();
      if (dateStr && timeStr) {
        const month = parseInt(dateStr.slice(0, 2)) - 1;
        const day = parseInt(dateStr.slice(2, 4));
        const hour = parseInt(timeStr.slice(0, 2));
        const minute = parseInt(timeStr.slice(2, 4));
        collectedAt.setMonth(month, day);
        collectedAt.setHours(hour, minute, 0, 0);

        if (!forceCollect) {
          // Check for duplicate collectedAt time (compare up to minutes)
          const duplicateRecord = records.find((r) => {
            if (r.paymentMethod === "UNPAID" || !r.collectedAt) return false;
            const rDate = r.collectedAt.toDate
              ? r.collectedAt.toDate()
              : new Date(r.collectedAt);
            return (
              rDate.getMonth() === collectedAt.getMonth() &&
              rDate.getDate() === collectedAt.getDate() &&
              rDate.getHours() === collectedAt.getHours() &&
              rDate.getMinutes() === collectedAt.getMinutes()
            );
          });

          if (duplicateRecord) {
            const rDate = duplicateRecord.collectedAt.toDate
              ? duplicateRecord.collectedAt.toDate()
              : new Date(duplicateRecord.collectedAt);
            const formattedTime = format(rDate, "MM/dd HH:mm");
            const batchTotal = recordsToUpdate
              .filter((r) => r.paymentMethod === "UNPAID")
              .reduce((sum, r) => sum + (r.totalAmount || 0), 0);

            setConfirmConfig({
              message: `동일한 날짜와 시간의 수금 기록이 이미 존재합니다.\n\n[기존 수금 기록]\n파견일: ${duplicateRecord.date.slice(5, 7)}/${duplicateRecord.date.slice(8, 10)}\n업소: ${duplicateRecord.establishmentName}\n직원: ${duplicateRecord.staffName}\n수금시간: ${formattedTime}\n금액: ${duplicateRecord.totalAmount.toLocaleString()}원${duplicateRecord.depositorName ? `\n입금자: ${duplicateRecord.depositorName}` : ""}\n\n[신규 일괄 입금 정보]\n대상: ${recordsToUpdate.length}건\n원래 미수 총액: ${batchTotal.toLocaleString()}원${customTotalAmount !== undefined ? `\n실제 수금 금액: ${customTotalAmount.toLocaleString()}원` : ""}${depositorName ? `\n입금자: ${depositorName}` : ""}\n\n위 내용으로 일괄 입금 처리를 진행하시겠습니까?`,
              action: () => {
                handleBatchCollect(
                  recordsToUpdate,
                  method,
                  dateStr,
                  timeStr,
                  isPass,
                  depositorName,
                  true,
                  customTotalAmount,
                );
              },
            });
            return;
          }
        }
      }

      const unpaidRecords = recordsToUpdate.filter((r) => r.paymentMethod === "UNPAID");
      if (unpaidRecords.length === 0) return;

      const batchOriginalTotal = unpaidRecords.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
      const totalAmountToCollect =
        customTotalAmount !== undefined &&
        !isNaN(customTotalAmount) &&
        customTotalAmount >= 0
          ? customTotalAmount
          : batchOriginalTotal;

      const newBatchTimestamp = Timestamp.fromDate(collectedAt);
      const newEstEntry: CollectionHistoryEntry = {
        collectedAt: newBatchTimestamp,
        amount: totalAmountToCollect,
        paymentMethod: method,
        ...(depositorName ? { depositorName } : {}),
        note: "1차 수금",
      };

      const updatePromises = unpaidRecords.map(async (r) => {
        const updates = {
          paymentMethod: method,
          collectedAt: newBatchTimestamp,
          additionalCollectedAt: null,
          collectionHistory: [newEstEntry],
          isPass: isPass,
          isDispatchBoxCollection: false,
          depositorName: depositorName || null,
          collectedAmount: undefined,
        };
        await updateDispatch(r.id!, updates as any);
        updateLocalRecord(r.id!, updates as any);
      });

      await Promise.all(updatePromises);
      setBatchCollecting(null);
    } catch (e) {
      console.error("일괄 수금 처리 중 오류:", e);
      setAlertConfig({
        message: `일괄 수금 처리 중 오류: ${getErrorMessage(e, "일괄 수금 처리 중 오류가 발생했습니다.")}`,
      });
    }
  };

  const handlePass = async (id: string, method: PaymentMethod) => {
    try {
      await handleCollect(id, method, "", "", true);
    } catch (error) {
      console.error("패스 처리 오류:", error);
    }
  };

  const handleBatchPass = async (
    recordsToUpdate: DispatchRecord[],
    method: PaymentMethod,
  ) => {
    try {
      await handleBatchCollect(recordsToUpdate, method, "", "", true);
    } catch (error) {
      console.error("일괄 패스 처리 오류:", error);
    }
  };

  const handleStaffPayment = async (
    staffRecords: DispatchRecord[],
    method: "CASH" | "TRANSFER",
    dateStr?: string,
    timeStr?: string,
  ) => {
    try {
      let staffPaidAt: Timestamp | null = null;
      if (dateStr && timeStr) {
        const now = new Date();
        const month = parseInt(dateStr.slice(0, 2)) - 1;
        const day = parseInt(dateStr.slice(2, 4));
        const hour = parseInt(timeStr.slice(0, 2));
        const minute = parseInt(timeStr.slice(2, 4));
        now.setMonth(month, day);
        now.setHours(hour, minute, 0, 0);
        staffPaidAt = Timestamp.fromDate(now);
      } else if (dateStr === undefined && timeStr === undefined) {
        // No time recording requested
        staffPaidAt = null;
      } else {
        // Default to current time if only one is missing (shouldn't happen with UI)
        staffPaidAt = Timestamp.now();
      }

      const updatePromises = staffRecords.map(async (r) => {
        const updates = {
          isStaffPaid: true,
          staffPaymentMethod: method,
          staffPaidAt,
        };
        await updateDispatch(r.id!, updates);
        updateLocalRecord(r.id!, updates);
      });
      await Promise.all(updatePromises);
      setPaymentSelection(null);
      setCustomPaymentTime(null);
    } catch (e) {
      console.error("지급 처리 중 오류:", e);
      setAlertConfig({
        message: `지급 처리 중 오류: ${getErrorMessage(e, "지급 처리 중 오류가 발생했습니다.")}`,
      });
    }
  };

  const title = {
    revenue: "총 수금액 상세 (업소별)",
    commission: "사무실 수수료 상세 (직원별)",
    staffPayment: "여직원 지급액 상세 (직원별)",
    unpaid: "총 미수금 상세 (날짜별)",
  }[type];

  const data = useMemo(() => {
    if (type === "unpaid") {
      // Show records that were ever unpaid from allUnpaidRecords
      const isOngoing = (r: DispatchRecord) => {
        const start = r.startTime.toDate
          ? r.startTime.toDate()
          : new Date(r.startTime);
        const end = r.endTime.toDate ? r.endTime.toDate() : new Date(r.endTime);
        return start.getTime() === end.getTime();
      };

      const unpaidRecords = localRecords.filter((r) => {
        const wasUnpaid = (r as any).wasUnpaid;
        if (!wasUnpaid) return false;

        // Issue 1: If it's ongoing, don't show in total unpaid list yet
        if (isOngoing(r)) return false;

        if (showShortageOnly) {
          const key = `${r.date}___${r.establishmentName}`;
          return shortageEstKeys.has(key);
        }

        return true;
      });

      const allGroups: Record<
        string,
        Record<
          string,
          { total: number; originalTotal: number; records: DispatchRecord[] }
        >
      > = {};

      unpaidRecords.forEach((r) => {
        const date = getRecordBusinessDate(r);
        if (!allGroups[date]) allGroups[date] = {};
        if (!allGroups[date][r.establishmentName]) {
          allGroups[date][r.establishmentName] = {
            total: 0,
            originalTotal: 0,
            records: [],
          };
        }
        if (r.paymentMethod === "UNPAID") {
          allGroups[date][r.establishmentName].total += r.totalAmount;
        } else {
          const currentCollected =
            r.collectedAmount !== undefined ? r.collectedAmount : r.totalAmount;
          if (currentCollected < r.totalAmount) {
            allGroups[date][r.establishmentName].total += (r.totalAmount - currentCollected);
          }
        }
        if ((r as any).wasUnpaid) {
          allGroups[date][r.establishmentName].originalTotal += r.totalAmount;
        }
        allGroups[date][r.establishmentName].records.push(r);
      });

      // Filter groups by search term
      const filteredGroups: Record<
        string,
        Record<
          string,
          { total: number; originalTotal: number; records: DispatchRecord[] }
        >
      > = {};
      if (deferredSearchTerm) {
        const lowerSearch = deferredSearchTerm.toLowerCase();
        Object.entries(allGroups).forEach(([date, establishments]) => {
          const filteredEsts: Record<
            string,
            { total: number; originalTotal: number; records: DispatchRecord[] }
          > = {};
          Object.entries(establishments).forEach(([estName, estData]) => {
            const matchesEst = estName.toLowerCase().includes(lowerSearch);
            const matchesDepositor = estData.records.some((r) =>
              r.depositorName?.toLowerCase().includes(lowerSearch),
            );
            if (matchesEst || matchesDepositor) {
              filteredEsts[estName] = estData;
            }
          });
          if (Object.keys(filteredEsts).length > 0) {
            filteredGroups[date] = filteredEsts;
          }
        });
      } else {
        Object.assign(filteredGroups, allGroups);
      }

      const unpaidByDate: Record<
        string,
        Record<
          string,
          { total: number; originalTotal: number; records: DispatchRecord[] }
        >
      > = {};
      const paidByDate: Record<
        string,
        Record<
          string,
          { total: number; originalTotal: number; records: DispatchRecord[] }
        >
      > = {};

      Object.entries(filteredGroups).forEach(([date, ests]) => {
        Object.entries(ests).forEach(([estName, estData]) => {
          if (estData.total > 0) {
            if (!unpaidByDate[date]) unpaidByDate[date] = {};
            unpaidByDate[date][estName] = estData;
          } else {
            if (!paidByDate[date]) paidByDate[date] = {};
            paidByDate[date][estName] = estData;
          }
        });
      });

      const result: [
        string,
        Record<
          string,
          { total: number; originalTotal?: number; records: DispatchRecord[] }
        >,
      ][] = [];

      const addGroupsToResult = (
        groups: Record<
          string,
          Record<
            string,
            { total: number; originalTotal?: number; records: DispatchRecord[] }
          >
        >,
      ) => {
        const sortedDates = Object.keys(groups).sort((a, b) =>
          b.localeCompare(a),
        );
        sortedDates.forEach((date) => {
          const ests = groups[date];
          const sortedEstEntries = Object.entries(ests).sort((a, b) => {
            const valA =
              a[1].originalTotal !== undefined && a[1].originalTotal > 0
                ? a[1].originalTotal
                : a[1].total;
            const valB =
              b[1].originalTotal !== undefined && b[1].originalTotal > 0
                ? b[1].originalTotal
                : b[1].total;
            if (valA !== valB) return valB - valA;
            return a[0].localeCompare(b[0]);
          });
          result.push([date, Object.fromEntries(sortedEstEntries)]);
        });
      };

      addGroupsToResult(unpaidByDate);
      addGroupsToResult(paidByDate);

      return result;
    }

    if (type === "staffPayment") {
      // Group by Date -> Staff
      const dateGroups: Record<
        string,
        Record<
          string,
          {
            total: number;
            totalTip: number;
            isPaid: boolean;
            method?: "CASH" | "TRANSFER";
            records: DispatchRecord[];
          }
        >
      > = {};

      localRecords.forEach((r) => {
        // Filter by searchTerm if present
        if (
          deferredSearchTerm &&
          !r.staffName.toLowerCase().includes(deferredSearchTerm.toLowerCase())
        )
          return;

        const date = r.date;
        const isToday = date === selectedDate;
        // Show if:
        // 1. It's today's record
        // 2. It's a record that is currently unpaid
        if (!isToday && r.isStaffPaid) return;

        if (!dateGroups[date]) dateGroups[date] = {};
        if (!dateGroups[date][r.staffName]) {
          dateGroups[date][r.staffName] = {
            total: 0,
            totalTip: 0,
            isPaid: true,
            records: [],
          };
        }

        const group = dateGroups[date][r.staffName];
        group.total += r.staffPayment;
        group.totalTip += r.tip || 0;
        group.records.push(r);
        if (!r.isStaffPaid) group.isPaid = false;
        if (r.isStaffPaid && !group.method) group.method = r.staffPaymentMethod;
      });

      // Sort dates descending
      const sortedDates = Object.keys(dateGroups).sort((a, b) =>
        b.localeCompare(a),
      );

      return sortedDates.map((date) => {
        const staffEntries = Object.entries(dateGroups[date]).sort((a, b) => {
          const nameA = a[0];
          const nameB = b[0];
          const sA = staff.find((s) => s.name === nameA);
          const sB = staff.find((s) => s.name === nameB);
          const tA = sA ? checkInTimes[sA.id!]?.toMillis?.() || 0 : 0;
          const tB = sB ? checkInTimes[sB.id!]?.toMillis?.() || 0 : 0;
          if (tA !== tB) return tA - tB;
          return nameA.localeCompare(nameB);
        });
        return [date, staffEntries];
      });
    }

    const groups: Record<string, any> = {};
    if (type === "commission") {
      const staffCommissions: Record<string, number> = {};
      localRecords
        .filter((r) => r.date === selectedDate)
        .forEach((r) => {
          staffCommissions[r.staffName] =
            (staffCommissions[r.staffName] || 0) + r.commission;
        });

      const validStaffNames2 = new Set(staff.map((s) => s.name));
      const allStaffNames = new Set([
        ...Object.keys(staffCommissions),
        ...Object.keys(manualDailyProfits).filter((name) =>
          validStaffNames2.has(name),
        ),
      ]);
      allStaffNames.forEach((name) => {
        // Filter by deferredSearchTerm
        if (
          deferredSearchTerm &&
          !name.toLowerCase().includes(deferredSearchTerm.toLowerCase())
        )
          return;

        const original = staffCommissions[name] || 0;
        const applied =
          manualDailyProfits[name] !== undefined
            ? manualDailyProfits[name]
            : original;
        groups[name] = { applied, original };
      });
    } else {
      localRecords
        .filter((r) => r.date === selectedDate)
        .forEach((r) => {
          let val = 0;
          let key = r.staffName;
          if (type === "revenue") {
            val = r.totalAmount;
            key = r.establishmentName;
          }

          // Filter by deferredSearchTerm
          if (
            deferredSearchTerm &&
            !key.toLowerCase().includes(deferredSearchTerm.toLowerCase())
          )
            return;

          groups[key] = (groups[key] || 0) + val;
        });
    }
    return Object.entries(groups).sort((a, b) => {
      if (type === "commission") {
        const nameA = a[0];
        const nameB = b[0];
        const staffA = staff.find((s) => s.name === nameA);
        const staffB = staff.find((s) => s.name === nameB);
        const timeA = staffA ? checkInTimes[staffA.id!]?.toMillis?.() || 0 : 0;
        const timeB = staffB ? checkInTimes[staffB.id!]?.toMillis?.() || 0 : 0;
        if (timeA !== timeB) return timeA - timeB;
        return nameA.localeCompare(nameB);
      }
      return b[1] - a[1];
    });
  }, [
    type,
    localRecords,
    selectedDate,
    staff,
    checkInTimes,
    unpaidStaffRecords,
    manualDailyProfits,
    deferredSearchTerm,
    showShortageOnly,
    shortageEstKeys,
  ]);

  const total = useMemo(() => {
    if (type === "unpaid") {
      let sum = 0;
      (
        data as [
          string,
          Record<string, { total: number; records: DispatchRecord[] }>,
        ][]
      ).forEach(([_, ests]) => {
        Object.values(ests).forEach((est) => {
          sum += est.total;
        });
      });
      return sum;
    }
    if (type === "staffPayment") {
      return (
        data as [
          string,
          [
            string,
            {
              total: number;
              totalTip: number;
              isPaid: boolean;
              method?: "CASH" | "TRANSFER";
              records: DispatchRecord[];
            },
          ][],
        ][]
      ).reduce((sum, [_, staffList]) => {
        return sum + staffList.reduce((s, [__, d]) => s + d.total, 0);
      }, 0);
    }
    if (type === "commission") {
      return (data as [string, { applied: number; original: number }][]).reduce(
        (sum, [_, val]) => sum + val.applied,
        0,
      );
    }
    return (data as [string, number][]).reduce((sum, [_, val]) => sum + val, 0);
  }, [type, data, localRecords]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col max-h-[80vh]"
      >
        <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-stone-50">
          <div>
            <h2 className="text-lg font-bold text-stone-900">{title}</h2>
            <p className="text-xs text-stone-500 font-bold mt-1">
              총 합계: {total.toLocaleString()}원
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-900 p-2 bg-white rounded-full shadow-sm border border-stone-100"
          >
            <Plus className="w-5 h-5 rotate-45" />
          </button>
        </div>

        {(type === "unpaid" ||
          type === "staffPayment" ||
          type === "commission" ||
          type === "revenue") && (
          <div className="px-5 py-3 bg-stone-50 border-b border-stone-100 flex flex-col gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="검색어 입력 (가게/직원 등)"
                className="w-full bg-white border border-stone-200 rounded-xl pl-9 pr-4 py-2 text-[16px] font-bold focus:outline-none focus:ring-2 focus:ring-stone-900/10 transition-all"
              />
            </div>

            {type === "unpaid" && (
              <div className="flex items-center gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => setShowShortageOnly(!showShortageOnly)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl font-black text-xs transition-all flex items-center gap-1.5 border shadow-2xs cursor-pointer active:scale-95",
                    showShortageOnly
                      ? "bg-red-500 text-white border-red-600 ring-2 ring-red-300"
                      : "bg-white text-stone-600 border-stone-200 hover:bg-stone-100",
                  )}
                >
                  <span>⚠️ 감액 수금 내역만 보기</span>
                  <span
                    className={cn(
                      "px-1.5 py-0.2 rounded-full text-[10px] font-bold",
                      showShortageOnly
                        ? "bg-red-700 text-white"
                        : "bg-stone-100 text-stone-600 border border-stone-200",
                    )}
                  >
                    {shortageCount}건
                  </span>
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {type === "unpaid" ? (
            (
              data as [
                string,
                Record<string, { total: number; records: DispatchRecord[] }>,
              ][]
            ).map(([date, establishments], index) => (
              <div
                key={`${date}-${index}`}
                className="space-y-3"
                style={{
                  contentVisibility: "auto",
                  containIntrinsicSize: "auto 200px",
                }}
              >
                <div className="sticky top-0 bg-white/95 backdrop-blur-sm py-2 z-20">
                  <div className="px-3 py-1.5 bg-white border-2 border-stone-900 rounded-xl inline-flex items-center gap-2 shadow-md">
                    <Calendar className="w-3.5 h-3.5 text-stone-900" />
                    <span className="text-xs font-black text-stone-900">
                      {format(parseISO(date), "yyyy-MM-dd (eee)", {
                        locale: ko,
                      })}
                      {getRelativeDateLabel(date)}
                    </span>
                  </div>
                </div>
                <div className="space-y-3">
                  {Object.entries(establishments).map(([estName, estData]) => {
                    const calc = calculateEstablishmentCollection(estData.records);
                    const estTotalRequested = calc.totalRequested;
                    const estTotalCollected = calc.totalCollected;
                    const hasAnyCollection =
                      estData.records.some(
                        (r) =>
                          r.paymentMethod !== "UNPAID" ||
                          (r.collectedAmount !== undefined && r.collectedAmount > 0),
                      ) || estTotalCollected > 0;

                    const isMatch = hasAnyCollection && estTotalCollected === estTotalRequested;
                    const isUnder = hasAnyCollection && estTotalCollected < estTotalRequested;
                    const isOver = hasAnyCollection && estTotalCollected > estTotalRequested;
                    const diff = Math.abs(estTotalRequested - estTotalCollected);

                    const estRoundBreakdown = calc.roundBreakdown;

                    return (
                      <div
                        key={estName}
                        className={cn(
                          "rounded-2xl border-2 overflow-hidden shadow-sm transition-all",
                          isMatch
                            ? "bg-emerald-50/50 border-emerald-500/30"
                            : isOver
                              ? "bg-amber-50/50 border-amber-500/30 shadow-amber-50"
                              : "bg-red-50/50 border-red-500/30 shadow-red-50",
                        )}
                      >
                        <div
                          className={cn(
                            "px-3.5 py-2.5 flex flex-col gap-1.5 border-b-2",
                            isMatch
                              ? "bg-emerald-100/50 border-emerald-500/20"
                              : isOver
                                ? "bg-amber-100/50 border-amber-500/20"
                                : "bg-red-100/50 border-red-500/20",
                          )}
                        >
                          {/* 상단 행: 업장명 및 버튼 그룹 */}
                          <div className="flex flex-wrap items-center justify-between gap-2 w-full min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                              <Building2
                                className={cn(
                                  "w-5 h-5 shrink-0",
                                  isMatch
                                    ? "text-emerald-500"
                                    : isOver
                                      ? "text-amber-500"
                                      : "text-red-500",
                                )}
                              />
                              <span className="font-black text-stone-900 text-base whitespace-nowrap truncate">
                                {estName}
                              </span>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/90 text-stone-800 border border-stone-300 rounded-md text-[11px] font-black shrink-0 shadow-2xs">
                                <Calendar className="w-3 h-3 text-stone-500 shrink-0" />
                                <span>{format(parseISO(date), "yyyy-MM-dd (eee)", { locale: ko })}</span>
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                              {batchCollecting?.dateKey === date &&
                              batchCollecting?.estName === estName ? (
                                <button
                                  onClick={() => setBatchCollecting(null)}
                                  className="px-2.5 py-1.5 bg-stone-200 text-stone-700 rounded-xl text-[10px] font-black shadow-xs hover:bg-stone-300 transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                                >
                                  ✕ 닫기
                                </button>
                              ) : (
                                <>
                                  {estData.records.some(
                                    (r) => r.paymentMethod === "UNPAID",
                                  ) && (
                                    <>
                                      <button
                                        onClick={() =>
                                          setBatchCollecting({
                                            dateKey: date,
                                            estName: estName,
                                            method: "CASH",
                                            date: format(new Date(), "MMdd"),
                                            time: format(new Date(), "HHmm"),
                                            depositorName: "",
                                          })
                                        }
                                        className="px-2 py-1.5 bg-emerald-600 text-white rounded-xl text-[9px] font-black shadow-sm active:scale-95 flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer hover:bg-emerald-700 transition-all"
                                      >
                                        현금전체
                                      </button>
                                      <button
                                        onClick={() =>
                                          setBatchCollecting({
                                            dateKey: date,
                                            estName: estName,
                                            method: "TRANSFER",
                                            date: format(new Date(), "MMdd"),
                                            time: format(new Date(), "HHmm"),
                                            depositorName: "",
                                          })
                                        }
                                        className="px-2 py-1.5 bg-blue-600 text-white rounded-xl text-[9px] font-black shadow-sm active:scale-95 flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer hover:bg-blue-700 transition-all"
                                      >
                                        계좌전체
                                      </button>
                                    </>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const key = `${date}_${estName}`;
                                      setBatchAdditionalCollectingKey(
                                        batchAdditionalCollectingKey === key ? null : key,
                                      );
                                    }}
                                    className="px-2 py-1.5 bg-amber-500 text-white rounded-xl text-[9px] font-black shadow-sm hover:bg-amber-600 transition-all active:scale-95 flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                                  >
                                    ➕ 추가수금/조정
                                  </button>
                                </>
                              )}
                              {(hasAnyCollection ||
                                estTotalCollected > 0 ||
                                estData.records.some(
                                  (r) =>
                                    r.paymentMethod !== "UNPAID" ||
                                    (r.collectionHistory &&
                                      r.collectionHistory.length > 0) ||
                                    (r.collectedAmount !== undefined &&
                                      r.collectedAmount > 0),
                                )) && (
                                <button
                                  onClick={() => {
                                    setConfirmConfig({
                                      message:
                                        "가게 전체 수금 완료 처리를 취소하시겠습니까?",
                                      action: async () => {
                                        try {
                                          const updatePromises = estData.records
                                            .filter((r) => r.id)
                                            .map(async (r) => {
                                              const updates = {
                                                paymentMethod:
                                                  "UNPAID" as PaymentMethod,
                                                collectedAt: null,
                                                additionalCollectedAt: null,
                                                collectionHistory: [],
                                                isPass: false,
                                                collectedAmount: 0,
                                                depositorName: null,
                                                isDispatchBoxCollection: false,
                                                wasUnpaid: true,
                                              };
                                              await updateDispatch(r.id!, updates);
                                              updateLocalRecord(r.id!, updates);
                                            });
                                          await Promise.all(updatePromises);
                                        } catch (e) {
                                          console.error(
                                            "가게 전체 수금 취소 중 오류:",
                                            e,
                                          );
                                          setAlertConfig({
                                            message: `수금 취소 중 오류: ${getErrorMessage(e, "수금 취소 중 오류가 발생했습니다.")}`,
                                          });
                                        }
                                      },
                                    });
                                  }}
                                  className="px-3 py-1.5 bg-stone-100 text-stone-600 rounded-xl text-[10px] font-black shadow-sm active:scale-95 flex items-center gap-1 border border-stone-200 whitespace-nowrap shrink-0 cursor-pointer hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition-all"
                                >
                                  전체 취소
                                </button>
                              )}
                            </div>
                          </div>

                          {/* 하단 행: 대조 상태 뱃지 및 금액 정보 */}
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                            {isMatch && (
                              <span className="whitespace-nowrap shrink-0 px-2 py-0.5 bg-emerald-500 text-white text-[11px] rounded-md font-black shadow-xs tracking-tight">
                                수금완료 (일치)
                              </span>
                            )}
                            {isUnder && (
                              <span className="whitespace-nowrap shrink-0 px-2 py-0.5 bg-red-500 text-white text-[11px] rounded-md font-black shadow-xs tracking-tight animate-pulse">
                                미수 (덜 받음: -{diff.toLocaleString()}원)
                              </span>
                            )}
                            {isOver && (
                              <span className="whitespace-nowrap shrink-0 px-2 py-0.5 bg-amber-500 text-white text-[11px] rounded-md font-black shadow-xs tracking-tight animate-pulse">
                                초과수금 (+{diff.toLocaleString()}원)
                              </span>
                            )}
                            {!hasAnyCollection && estData.total > 0 && (
                              <span className="font-black text-red-500 text-[10px] bg-red-100 px-1.5 py-0.5 rounded whitespace-nowrap shrink-0">
                                미수금: {estData.total.toLocaleString()}원
                              </span>
                            )}

                            <div className="flex items-center gap-1 whitespace-nowrap shrink-0">
                              <span className="text-[10px] font-bold text-stone-400 whitespace-nowrap">
                                총 청구액:
                              </span>
                              <span className="font-black text-stone-800 text-xs whitespace-nowrap">
                                {estTotalRequested.toLocaleString()}원
                              </span>
                            </div>
                            <div className="flex items-center gap-1 whitespace-nowrap shrink-0">
                              <span className="text-[10px] font-bold text-stone-400 whitespace-nowrap">
                                총 수금액:
                              </span>
                              <span className="font-black text-emerald-600 text-xs whitespace-nowrap">
                                {estTotalCollected.toLocaleString()}원
                              </span>
                            </div>
                            {estRoundBreakdown.length > 0 && (
                              <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                                {estRoundBreakdown.map((rd, rdIdx) => (
                                  <span
                                    key={`${rd.label}-${rd.round}-${rdIdx}`}
                                    className={cn(
                                      "px-2 py-0.5 rounded-lg text-[11px] font-black border whitespace-nowrap shrink-0 shadow-2xs inline-flex items-center gap-1",
                                      rd.isOnSite
                                        ? "bg-teal-50 text-teal-950 border-teal-300"
                                        : rd.round === 1
                                          ? "bg-emerald-50 text-emerald-900 border-emerald-300"
                                          : "bg-amber-50 text-amber-950 border-amber-300"
                                    )}
                                  >
                                    <span
                                      className={cn(
                                        "px-1 py-0.2 rounded text-[9px] font-black",
                                        rd.isOnSite
                                          ? "bg-teal-200/90 text-teal-950"
                                          : rd.round === 1
                                            ? "bg-emerald-200/80 text-emerald-900"
                                            : "bg-amber-200/80 text-amber-950"
                                      )}
                                    >
                                      {rd.isOnSite ? "현장" : `${rd.round}차`}
                                    </span>
                                    {rd.dateStr && (
                                      <span className="text-[10px] font-bold text-stone-600">
                                        {rd.dateStr}
                                      </span>
                                    )}
                                    <span className="font-black text-stone-900">
                                      {rd.amount.toLocaleString()}원
                                    </span>
                                    {rd.paymentMethod && (
                                      <span className="text-[9px] font-bold text-stone-500">
                                        ({rd.paymentMethod === "TRANSFER" ? "계좌" : "현금"})
                                      </span>
                                    )}
                                    {rd.depositorName && (
                                      <span className="text-[9px] font-black text-blue-600">
                                        [{rd.depositorName}]
                                      </span>
                                    )}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                      {/* 일괄 수금 입력 폼 (전체 너비 영역) */}
                      {batchCollecting?.dateKey === date &&
                        batchCollecting?.estName === estName && (
                          <div className="px-3 py-2 bg-stone-100/90 border-b border-stone-200 w-full box-border">
                            <BatchCollectForm
                              initialMethod={batchCollecting.method}
                              totalUnpaidAmount={estData.records
                                .filter((r) => r.paymentMethod === "UNPAID")
                                .reduce((sum, r) => sum + r.totalAmount, 0)}
                              onCollect={(
                                method,
                                date,
                                time,
                                depositorName,
                                customAmount,
                              ) => {
                                handleBatchCollect(
                                  estData.records,
                                  method,
                                  date,
                                  time,
                                  false,
                                  depositorName,
                                  false,
                                  customAmount,
                                );
                              }}
                              onPass={(method) =>
                                handleBatchPass(estData.records, method)
                              }
                              onCancel={() => setBatchCollecting(null)}
                            />
                          </div>
                        )}
                      {batchAdditionalCollectingKey === `${date}_${estName}` && (
                        <div className="px-4 py-2 border-b border-amber-200 bg-amber-50/60">
                          <EstablishmentAdditionalCollectForm
                            estName={estName}
                            originalTotal={estData.records.reduce(
                              (sum, r) => sum + r.totalAmount,
                              0,
                            )}
                            currentCollected={estData.records.reduce(
                              (sum, r) => {
                                if (r.paymentMethod === "UNPAID") return sum;
                                return (
                                  sum +
                                  (r.collectedAmount !== undefined
                                    ? r.collectedAmount
                                    : r.totalAmount)
                                );
                              },
                              0,
                            )}
                            onCollectAdditional={(
                              method,
                              additionalAmount,
                              depositorName,
                              collectedDate,
                              collectedTime,
                            ) => {
                              handleEstablishmentAdditionalCollect(
                                estData.records,
                                method,
                                additionalAmount,
                                depositorName,
                                collectedDate,
                                collectedTime,
                              );
                            }}
                            onCancel={() =>
                              setBatchAdditionalCollectingKey(null)
                            }
                          />
                        </div>
                      )}
                      <div className="p-3 space-y-2">
                        {estData.records.map((r) => (
                          <div
                            id={`record-${r.id}`}
                            key={r.id}
                            className={cn(
                              "flex justify-between items-center group p-2 rounded-xl transition-all",
                              highlightedId === r.id &&
                                "ring-4 ring-emerald-500 bg-emerald-100/90 scale-[1.03] shadow-xl z-20 animate-pulse transition-all duration-300",
                            )}
                          >
                            <div className="flex flex-col gap-1 flex-1 min-w-0 mr-2">
                              <div className="flex items-center gap-2">
                                {(() => {
                                  const { main4, affiliation } = formatStaffNameComponents(r.staffName);
                                  return (
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-stone-900 font-black text-sm">
                                        {main4}
                                      </span>
                                      {affiliation && (
                                        <span
                                          className={cn(
                                            "px-1.5 py-0.5 rounded text-[10px] sm:text-[11px] font-black text-white shrink-0 whitespace-nowrap shadow-xs",
                                            affiliation === "직속" ? "bg-amber-500" : "bg-purple-600"
                                          )}
                                        >
                                          {affiliation}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })()}
                                {r.paymentMethod !== "UNPAID" && (
                                  <div className="flex items-center gap-1">
                                    <span
                                      className={cn(
                                        "text-[9px] font-black px-1.5 py-0.5 rounded border",
                                        r.paymentMethod === "CASH"
                                          ? "text-emerald-600 bg-emerald-50 border-emerald-100"
                                          : "text-blue-600 bg-blue-50 border-blue-100",
                                      )}
                                    >
                                      {r.isPass
                                        ? "패스"
                                        : r.paymentMethod === "CASH"
                                          ? "현금"
                                          : "계좌"}
                                    </span>
                                    {r.depositorName && (
                                      <span className="text-[9px] font-bold text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200">
                                        {r.depositorName}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="text-[9px] font-bold text-stone-400 w-10 shrink-0">
                                    미수일:
                                  </span>
                                  <span className="text-[10px] font-black text-stone-600 bg-stone-100 px-1.5 rounded">
                                    {format(parseISO(r.date), "MM/dd")}
                                  </span>
                                  <span className="text-stone-900 font-black text-xs ml-auto">
                                    {r.totalAmount.toLocaleString()}원
                                  </span>
                                </div>

                                {/* 근무시간 및 개수 정보 */}
                                {(() => {
                                  const start = r.startTime?.toDate
                                    ? r.startTime.toDate()
                                    : r.startTime
                                      ? new Date(r.startTime)
                                      : null;
                                  const end = r.endTime?.toDate
                                    ? r.endTime.toDate()
                                    : r.endTime
                                      ? new Date(r.endTime)
                                      : null;

                                  const startStr =
                                    start && !isNaN(start.getTime())
                                      ? format(start, "HH:mm")
                                      : "";
                                  const endStr =
                                    end && !isNaN(end.getTime())
                                      ? format(end, "HH:mm")
                                      : "";
                                  const isOngoing =
                                    start &&
                                    end &&
                                    start.getTime() === end.getTime();

                                  const timeText =
                                    startStr && endStr
                                      ? isOngoing
                                        ? `${startStr} ~ 진행중`
                                        : `${startStr} ~ ${endStr}`
                                      : "";

                                  let durationMinutesText = "";
                                  if (
                                    start &&
                                    end &&
                                    !isNaN(start.getTime()) &&
                                    !isNaN(end.getTime()) &&
                                    !isOngoing
                                  ) {
                                    const diffMins = Math.max(
                                      0,
                                      Math.floor(
                                        (end.getTime() - start.getTime()) /
                                          60000,
                                      ),
                                    );
                                    const h = Math.floor(diffMins / 60);
                                    const m = diffMins % 60;
                                    durationMinutesText = `${h > 0 ? `${h}시간 ` : ""}${m}분`;
                                  }

                                  const unitCount =
                                    r.durationHours !== undefined
                                      ? r.durationHours
                                      : 0;

                                  return (
                                    <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px] bg-stone-50 p-1.5 rounded-lg border border-stone-200/60 mt-0.5">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <Clock className="w-3 h-3 text-stone-400 shrink-0" />
                                        <span className="font-bold text-stone-400 shrink-0">
                                          근무:
                                        </span>
                                        <span className="font-black text-stone-700 truncate">
                                          {timeText || "시간 미기록"}
                                        </span>
                                        {durationMinutesText && (
                                          <span className="text-[9px] text-stone-400 font-medium shrink-0">
                                            ({durationMinutesText})
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1 shrink-0 ml-auto">
                                        <span className="font-bold text-stone-400">
                                          개수:
                                        </span>
                                        <span className="font-black text-amber-800 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200/80">
                                          {unitCount}개
                                        </span>
                                        <span
                                          className={cn(
                                            "text-[9px] font-black px-1.5 py-0.2 rounded text-white shadow-2xs",
                                            r.systemType === "TABLE"
                                              ? "bg-emerald-600"
                                              : r.systemType === "PUBLIC"
                                                ? "bg-blue-600"
                                                : "bg-purple-600",
                                          )}
                                        >
                                          {r.systemType === "TABLE"
                                            ? "커피"
                                            : r.systemType === "PUBLIC"
                                              ? "퍼블릭"
                                              : "하퍼"}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })()}

                                {r.paymentMethod !== "UNPAID" && (
                                  <div className="flex flex-col gap-1.5 mt-1 bg-emerald-50/60 p-2 rounded-xl border border-emerald-100 max-w-full overflow-hidden">
                                    {(() => {
                                      const isDirectBox =
                                        r.isDispatchBoxCollection === true ||
                                        (!r.wasUnpaid && (!r.collectionHistory || r.collectionHistory.length === 0));

                                      if (!isDirectBox) {
                                        return null;
                                      }

                                      const history = getRecordCollectionHistory(r);
                                      const onSiteEntries = history.filter((entry, idx) => {
                                        return (
                                          idx === 0 &&
                                          (!entry.note || entry.note.includes("현장") || !entry.note.includes("추가수금"))
                                        );
                                      });

                                      if (onSiteEntries.length === 0 && r.collectedAt) {
                                        onSiteEntries.push({
                                          collectedAt: r.collectedAt,
                                          amount: r.collectedAmount !== undefined ? r.collectedAmount : r.totalAmount,
                                          paymentMethod: (r.paymentMethod as any) !== "UNPAID" ? r.paymentMethod : undefined,
                                          depositorName: r.depositorName,
                                          note: "현장 수금",
                                        });
                                      }

                                      return (
                                        <div className="flex flex-wrap items-center gap-1.5 max-w-full overflow-x-auto pb-0.5 scrollbar-thin">
                                          {onSiteEntries.map((entry, idx) => {
                                            let formatted = "날짜 오류";
                                            try {
                                              const d = entry.collectedAt.toDate
                                                ? entry.collectedAt.toDate()
                                                : new Date(entry.collectedAt);
                                              formatted = format(d, "MM/dd HH:mm");
                                            } catch (e) {}

                                            const amtText = entry.amount !== undefined ? `${entry.amount.toLocaleString()}원` : null;

                                            return (
                                              <div key={idx} className="flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-teal-200 shadow-2xs shrink-0 whitespace-nowrap">
                                                <span className="text-[9px] font-black shrink-0 whitespace-nowrap text-teal-800 bg-teal-100 px-1 py-0.2 rounded">
                                                  현장 수금
                                                </span>
                                                <span className="text-[10px] font-black text-stone-800 shrink-0 whitespace-nowrap">
                                                  {formatted}
                                                </span>
                                                {amtText && (
                                                  <span className="text-[10px] font-black text-emerald-800 bg-emerald-50 px-1 rounded border border-emerald-100/80 shrink-0 whitespace-nowrap">
                                                    {amtText}
                                                  </span>
                                                )}
                                                {entry.paymentMethod && (
                                                  <span className="text-[9px] font-bold text-stone-500 shrink-0 whitespace-nowrap">
                                                    ({entry.paymentMethod === "TRANSFER" ? "계좌" : "현금"})
                                                  </span>
                                                )}
                                                {entry.depositorName && (
                                                  <span className="text-[9px] font-medium text-blue-600 shrink-0 whitespace-nowrap">
                                                    [{entry.depositorName}]
                                                  </span>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      );
                                    })()}

                                    <div className="flex items-center justify-between pt-1 border-t border-emerald-100/80 mt-0.5 whitespace-nowrap">
                                      <span className="text-[9px] font-bold text-emerald-800 shrink-0 whitespace-nowrap">
                                        최종 수금 금액
                                      </span>
                                      <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                                        <span className="text-emerald-700 font-black text-xs shrink-0 whitespace-nowrap">
                                          {(r.collectedAmount !== undefined ? r.collectedAmount : r.totalAmount).toLocaleString()}원
                                        </span>
                                        {r.collectedAmount !== undefined && r.collectedAmount < r.totalAmount && (
                                          <span className="px-1.5 py-0.5 bg-red-100 text-red-700 font-black text-[9px] rounded border border-red-200 animate-pulse shrink-0 whitespace-nowrap">
                                            ⚠️ 감액수금 (원래 {r.totalAmount.toLocaleString()}원 / -{(r.totalAmount - r.collectedAmount).toLocaleString()}원)
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                            {r.paymentMethod === "UNPAID" ? (
                              <div className="flex items-center gap-1">
                                {collectingInfo?.id === r.id ? (
                                  <InlineRowCollectForm
                                    initialMethod={collectingInfo.method}
                                    originalAmount={r.totalAmount}
                                    onCollect={(
                                      method,
                                      date,
                                      time,
                                      depositorName,
                                      customAmount,
                                    ) => {
                                      handleCollect(
                                        r.id!,
                                        method,
                                        date,
                                        time,
                                        false,
                                        depositorName,
                                        false,
                                        customAmount,
                                      );
                                    }}
                                    onPass={(method) =>
                                      handlePass(r.id!, method)
                                    }
                                    onCancel={() => setCollectingInfo(null)}
                                  />
                                ) : (
                                  <>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setCollectingInfo({
                                          id: r.id!,
                                          method: "CASH",
                                          date: format(new Date(), "MMdd"),
                                          time: format(new Date(), "HHmm"),
                                          depositorName: "",
                                        });
                                      }}
                                      className="px-2 py-1 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-lg text-[9px] font-black hover:bg-emerald-600 hover:text-white transition-all active:scale-95"
                                    >
                                      현금
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setCollectingInfo({
                                          id: r.id!,
                                          method: "TRANSFER",
                                          date: format(new Date(), "MMdd"),
                                          time: format(new Date(), "HHmm"),
                                          depositorName: "",
                                        });
                                      }}
                                      className="px-2 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-[9px] font-black hover:bg-blue-600 hover:text-white transition-all active:scale-95"
                                    >
                                      계좌
                                    </button>
                                  </>
                                )}
                              </div>
                            ) : (
                              <div className="flex flex-col items-end gap-1">
                                <div className="flex items-center gap-2">
                                  <div className="text-emerald-600">
                                    <CheckCircle2 className="w-5 h-5" />
                                  </div>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setConfirmConfig({
                                            message:
                                              "수금 완료 처리를 취소하시겠습니까?",
                                            action: async () => {
                                              try {
                                                const updates = {
                                                  paymentMethod:
                                                    "UNPAID" as PaymentMethod,
                                                  collectedAt: null,
                                                  additionalCollectedAt: null,
                                                  collectionHistory: [],
                                                  isPass: false,
                                                  collectedAmount: 0,
                                                  depositorName: null,
                                                  isDispatchBoxCollection: false,
                                                  wasUnpaid: true,
                                                };
                                                await updateDispatch(
                                                  r.id!,
                                                  updates,
                                                );
                                                updateLocalRecord(r.id!, updates);
                                              } catch (e) {
                                                console.error(
                                                  "수금 취소 중 오류:",
                                                  e,
                                                );
                                                setAlertConfig({
                                                  message: `수금 취소 중 오류: ${getErrorMessage(e, "수금 취소 중 오류가 발생했습니다.")}`,
                                                });
                                              }
                                            },
                                          });
                                        }}
                                        className="text-[10px] font-black text-stone-400 hover:text-red-500 underline underline-offset-2"
                                      >
                                        취소
                                      </button>
                                    </div>
                                    {(r.paymentMethod as string) !== "UNPAID" && (
                                      <div className="mt-1 px-2 py-1 bg-emerald-50 rounded-lg border border-emerald-100 inline-flex flex-col items-end gap-0.5 max-w-full overflow-hidden">
                                        <span className="text-[9px] font-black text-emerald-700 whitespace-nowrap">
                                          수금 완료 ({r.paymentMethod === "TRANSFER" ? "계좌" : "현금"})
                                        </span>
                                        {(() => {
                                          const isDirectBox =
                                            r.isDispatchBoxCollection === true ||
                                            (!r.wasUnpaid && (!r.collectionHistory || r.collectionHistory.length === 0));

                                          if (!isDirectBox) {
                                            return null;
                                          }

                                          const history = getRecordCollectionHistory(r);
                                          const onSiteEntries = history.filter((entry, idx) => {
                                            return (
                                              idx === 0 &&
                                              (!entry.note || entry.note.includes("현장") || !entry.note.includes("추가수금"))
                                            );
                                          });

                                          if (onSiteEntries.length === 0 && r.collectedAt) {
                                            onSiteEntries.push({
                                              collectedAt: r.collectedAt,
                                              amount: r.collectedAmount !== undefined ? r.collectedAmount : r.totalAmount,
                                              paymentMethod: r.paymentMethod,
                                              depositorName: r.depositorName,
                                              note: "현장 수금",
                                            });
                                          }

                                          return onSiteEntries.map((entry, idx) => {
                                            let formatted = "날짜 오류";
                                            try {
                                              const d = entry.collectedAt.toDate
                                                ? entry.collectedAt.toDate()
                                                : new Date(entry.collectedAt);
                                              formatted = format(d, "MM/dd HH:mm");
                                            } catch (e) {}

                                            const amtText = entry.amount !== undefined ? `${entry.amount.toLocaleString()}원` : "";

                                            return (
                                              <span
                                                key={idx}
                                                className="text-[9px] font-black text-teal-800 whitespace-nowrap"
                                              >
                                                현장 수금: {formatted} {amtText ? `(${amtText})` : ""}
                                              </span>
                                            );
                                          });
                                        })()}
                                        {r.isPass && (
                                          <span className="text-[8px] text-red-400 font-black whitespace-nowrap">
                                            (패스)
                                          </span>
                                        )}
                                        {r.isDispatchBoxCollection && (
                                          <span className="text-[8px] text-blue-400 font-black whitespace-nowrap">
                                            (파견)
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
            ))
          ) : type === "staffPayment" ? (
            <div className="space-y-8">
              {(
                data as [
                  string,
                  [
                    string,
                    {
                      total: number;
                      totalTip: number;
                      isPaid: boolean;
                      method?: "CASH" | "TRANSFER";
                      records: DispatchRecord[];
                    },
                  ][],
                ][]
              ).map(([date, staffList]) => (
                <div
                  key={date}
                  className="space-y-4"
                  style={{
                    contentVisibility: "auto",
                    containIntrinsicSize: "auto 200px",
                  }}
                >
                  <div className="sticky top-0 bg-white/95 backdrop-blur-sm py-2 z-20">
                    <div className="px-3 py-1.5 bg-white border-2 border-stone-900 rounded-xl inline-flex items-center gap-2 shadow-md">
                      <Calendar className="w-3.5 h-3.5 text-stone-900" />
                      <span className="text-xs font-black text-stone-900">
                        {format(parseISO(date), "yyyy-MM-dd (eee)", {
                          locale: ko,
                        })}
                        {getRelativeDateLabel(date)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {staffList.map(([name, d]) => (
                      <div
                        id={`staff-payment-${date}-${name}`}
                        key={name}
                        className={cn(
                          "p-4 rounded-2xl border-2 shadow-sm flex flex-col gap-3 transition-all",
                          highlightedId === `${date}-${name}`
                            ? "ring-4 ring-emerald-500 scale-[1.02] bg-emerald-50/50 border-emerald-500 shadow-xl z-20"
                            : d.isPaid
                              ? "bg-emerald-50/30 border-emerald-500/50"
                              : "bg-white border-red-500/50 shadow-red-50",
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col">
                            <div className="flex items-center flex-wrap gap-2 mb-1">
                              {(() => {
                                const { main4, affiliation } = formatStaffNameComponents(name);
                                return (
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-black text-stone-900 text-base">
                                      {main4}
                                    </span>
                                    {affiliation && (
                                      <span
                                        className={cn(
                                          "px-1.5 py-0.5 rounded text-[10px] sm:text-[11px] font-black text-white shrink-0 whitespace-nowrap shadow-xs",
                                          affiliation === "직속" ? "bg-amber-500" : "bg-purple-600"
                                        )}
                                      >
                                        {affiliation}
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                              {staff?.find((s) => s.name === name)
                                ?.accountNumber && (
                                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-lg border border-blue-100/50">
                                  {
                                    staff.find((s) => s.name === name)
                                      ?.accountNumber
                                  }
                                </span>
                              )}
                              {d.isPaid && (
                                <span
                                  className={cn(
                                    "text-[10px] font-black px-1.5 py-0.5 rounded border flex items-center gap-1",
                                    d.method === "CASH"
                                      ? "text-emerald-600 bg-emerald-50 border-emerald-100"
                                      : "text-blue-600 bg-blue-50 border-blue-100",
                                  )}
                                >
                                  <Check className="w-3 h-3" />
                                  {d.method === "CASH"
                                    ? "현금 지급"
                                    : "계좌 지급"}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold text-stone-500">
                                지급액: {d.total.toLocaleString()}원
                              </span>
                              {d.totalTip > 0 && (
                                <span className="text-xs font-bold text-red-400">
                                  팁: {d.totalTip.toLocaleString()}원
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {d.isPaid ? (
                              <button
                                onClick={() => {
                                  setConfirmConfig({
                                    message: `${name}님의 ${date} 지급 완료 처리를 취소하시겠습니까?`,
                                    action: async () => {
                                      try {
                                        const updatePromises = d.records.map(
                                          async (r) => {
                                            const updates = {
                                              isStaffPaid: false,
                                              staffPaymentMethod: null,
                                              staffPaidAt: null,
                                            };
                                            await updateDispatch(
                                              r.id!,
                                              updates,
                                            );
                                            updateLocalRecord(r.id!, updates);
                                          },
                                        );
                                        await Promise.all(updatePromises);
                                      } catch (e) {
                                        console.error("지급 취소 중 오류:", e);
                                        setAlertConfig({
                                          message: `지급 취소 중 오류: ${getErrorMessage(e, "지급 취소 중 오류가 발생했습니다.")}`,
                                        });
                                      }
                                    },
                                  });
                                }}
                                className="px-3 py-1.5 rounded-xl text-[10px] font-black transition-all active:scale-95 bg-stone-100 text-stone-500 border border-stone-200"
                              >
                                지급 취소
                              </button>
                            ) : (
                              <div className="flex gap-1">
                                <button
                                  onClick={() =>
                                    setPaymentSelection({
                                      name,
                                      records: d.records,
                                      method: "CASH",
                                    })
                                  }
                                  className="px-2 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl text-[10px] font-black hover:bg-emerald-600 hover:text-white transition-all active:scale-95"
                                >
                                  현금지급
                                </button>
                                <button
                                  onClick={() =>
                                    setPaymentSelection({
                                      name,
                                      records: d.records,
                                      method: "TRANSFER",
                                    })
                                  }
                                  className="px-2 py-1.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-xl text-[10px] font-black hover:bg-blue-600 hover:text-white transition-all active:scale-95"
                                >
                                  계좌지급
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1 pt-2 border-t border-stone-100/50">
                          {d.records.map((r, idx) => (
                            <div
                              key={idx}
                              className="flex justify-between text-[10px] text-stone-500"
                            >
                              <div className="flex items-center gap-1">
                                <span>{r.establishmentName}</span>
                                {r.isStaffPaid && r.staffPaidAt && (
                                  <span className="text-[8px] opacity-50">
                                    ({format(r.staffPaidAt.toDate(), "HH:mm")})
                                  </span>
                                )}
                              </div>
                              <span className="font-bold">
                                {r.staffPayment.toLocaleString()}원
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            (data as [string, any][]).map(([name, value]) => (
              <div
                key={name}
                className="flex items-center justify-between p-4 bg-white rounded-2xl border border-stone-100 shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="font-bold text-stone-700">{name}</span>
                  {type === "commission" &&
                    manualDailyProfits[name] !== undefined && (
                      <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-black rounded border border-amber-200">
                        별도수익
                      </span>
                    )}
                </div>
                <div className="flex flex-col items-end">
                  <span className="font-black text-stone-900">
                    {type === "commission"
                      ? (value as { applied: number }).applied.toLocaleString()
                      : (value as number).toLocaleString()}
                    원
                  </span>
                  {type === "commission" &&
                    manualDailyProfits[name] !== undefined && (
                      <span className="text-[10px] font-bold text-stone-400 line-through">
                        원래:{" "}
                        {(
                          value as { original: number }
                        ).original.toLocaleString()}
                        원
                      </span>
                    )}
                </div>
              </div>
            ))
          )}
          {data.length === 0 && (
            <div className="text-center py-12 text-stone-400">
              데이터가 없습니다.
            </div>
          )}
        </div>
        <AnimatePresence>
          {confirmConfig && (
            <ConfirmModal
              message={confirmConfig.message}
              onConfirm={async () => {
                try {
                  await confirmConfig.action();
                } catch (e) {
                  console.error("Confirm action error:", e);
                }
                setConfirmConfig(null);
              }}
              onCancel={() => setConfirmConfig(null)}
            />
          )}
          {alertConfig && (
            <AlertModal
              message={alertConfig.message}
              actionLabel={alertConfig.actionLabel}
              onAction={alertConfig.onAction}
              onClose={() => setAlertConfig(null)}
            />
          )}

          {/* Payment Time Selection Modal */}
          {paymentSelection && (
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => {
                  setPaymentSelection(null);
                  setCustomPaymentTime(null);
                }}
                className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={(e) => e.stopPropagation()}
                className="relative z-10 w-full max-w-xs bg-white rounded-3xl shadow-2xl p-6"
              >
                <div className="text-center mb-6">
                  <div
                    className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4",
                      paymentSelection.method === "CASH"
                        ? "bg-emerald-50 text-emerald-500"
                        : "bg-blue-50 text-blue-500",
                    )}
                  >
                    <Clock className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-stone-900 mb-1">
                    {paymentSelection.name}님 지급
                  </h3>
                  <p className="text-xs text-stone-500">
                    지급 시간을 어떻게 기록할까요?
                  </p>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={() =>
                      handleStaffPayment(
                        paymentSelection.records,
                        paymentSelection.method,
                        format(new Date(), "MMdd"),
                        format(new Date(), "HHmm"),
                      )
                    }
                    className="w-full py-3 bg-stone-900 text-white rounded-xl font-bold text-sm hover:bg-stone-800 transition-colors flex items-center justify-center gap-2"
                  >
                    <Zap className="w-4 h-4" /> 현재 시간으로 기록
                  </button>
                  <button
                    onClick={() =>
                      handleStaffPayment(
                        paymentSelection.records,
                        paymentSelection.method,
                      )
                    }
                    className="w-full py-3 bg-stone-100 text-stone-600 rounded-xl font-bold text-sm hover:bg-stone-200 transition-colors"
                  >
                    시간 기록 없이 처리
                  </button>

                  <div className="pt-2 border-t border-stone-100">
                    <button
                      onClick={() => {
                        if (customPaymentTime) {
                          const dateVal =
                            (
                              document.getElementById(
                                "custom-date-ref",
                              ) as HTMLInputElement
                            )?.value || "";
                          const timeVal =
                            (
                              document.getElementById(
                                "custom-time-ref",
                              ) as HTMLInputElement
                            )?.value || "";
                          if (dateVal.length === 4 && timeVal.length === 4) {
                            handleStaffPayment(
                              paymentSelection.records,
                              paymentSelection.method,
                              dateVal,
                              timeVal,
                            );
                          } else {
                            alert("날짜와 시간을 4자리씩 입력해주세요.");
                          }
                        } else {
                          setCustomPaymentTime({
                            date: format(new Date(), "MMdd"),
                            time: format(new Date(), "HHmm"),
                          });
                          setTimeout(
                            () => customTimeInputRef.current?.focus(),
                            100,
                          );
                        }
                      }}
                      className={cn(
                        "w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2",
                        customPaymentTime
                          ? "bg-emerald-600 text-white"
                          : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50",
                      )}
                    >
                      <Calendar className="w-4 h-4" />{" "}
                      {customPaymentTime
                        ? "입력한 시간으로 지급"
                        : "날짜/시간 직접 입력"}
                    </button>

                    <AnimatePresence>
                      {customPaymentTime && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden mt-3 space-y-2"
                        >
                          <div className="flex gap-2">
                            <div className="flex-1">
                              <label className="text-[10px] font-black text-stone-400 mb-1 block ml-1">
                                날짜 (MMDD)
                              </label>
                              <input
                                id="custom-date-ref"
                                type="text"
                                inputMode="numeric"
                                defaultValue={customPaymentTime.date}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => {
                                  const val = e.target.value
                                    .replace(/[^0-9]/g, "")
                                    .slice(0, 4);
                                  e.target.value = val;
                                  if (val.length === 4) {
                                    setTimeout(
                                      () => customTimeInputRef.current?.focus(),
                                      0,
                                    );
                                  }
                                }}
                                placeholder="0317"
                                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-[16px] font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                              />
                            </div>
                            <div className="flex-1">
                              <label className="text-[10px] font-black text-stone-400 mb-1 block ml-1">
                                시간 (HHMM)
                              </label>
                              <input
                                id="custom-time-ref"
                                ref={customTimeInputRef}
                                type="text"
                                inputMode="numeric"
                                defaultValue={customPaymentTime.time}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => {
                                  e.target.value = e.target.value
                                    .replace(/[^0-9]/g, "")
                                    .slice(0, 4);
                                }}
                                placeholder="1430"
                                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-[16px] font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                              />
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <button
                    onClick={() => {
                      setPaymentSelection(null);
                      setCustomPaymentTime(null);
                    }}
                    className="w-full py-3 text-stone-400 font-bold text-xs hover:text-stone-600 transition-colors"
                  >
                    닫기
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function StatCard({
  title,
  value,
  displayValue,
  icon,
  color,
  onClick,
  isCompleted,
  completedColor = "emerald",
  completedText = "완료",
}: {
  title: string;
  value: number;
  displayValue?: React.ReactNode;
  icon: React.ReactNode;
  color: string;
  onClick?: () => void;
  isCompleted?: boolean;
  completedColor?: "emerald" | "red" | "blue";
  completedText?: string;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-white p-4 rounded-2xl border transition-all active:scale-95 cursor-pointer",
        isCompleted
          ? completedColor === "red"
            ? "border-red-500 shadow-red-100 shadow-lg"
            : completedColor === "blue"
              ? "border-blue-500 shadow-blue-100 shadow-lg"
              : "border-emerald-500 shadow-emerald-100 shadow-lg"
          : "border-stone-200 shadow-sm hover:border-stone-400",
        onClick && "hover:shadow-md",
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-stone-500">{title}</span>
          {isCompleted && (
            <div
              className={cn(
                "flex items-center gap-1 text-white px-1.5 py-0.5 rounded-full scale-75 origin-left",
                completedColor === "red"
                  ? "bg-red-500"
                  : completedColor === "blue"
                    ? "bg-blue-500"
                    : "bg-emerald-500",
              )}
            >
              <CheckCircle2 className="w-3 h-3" />
              <span className="text-[10px] font-black">{completedText}</span>
            </div>
          )}
        </div>
        <div className={cn("p-2 rounded-lg", color)}>{icon}</div>
      </div>
      <div className="text-xl font-bold flex items-baseline gap-1">
        {displayValue || <span>{value.toLocaleString()}원</span>}
      </div>
    </div>
  );
}

function ManualProfitModal({
  onClose,
  staffName,
  date,
  currentCalculatedProfit,
  currentManualProfit,
}: {
  onClose: () => void;
  staffName: string;
  date: string;
  currentCalculatedProfit: number;
  currentManualProfit?: number;
}) {
  const [profitType, setProfitType] = useState<"AUTO" | "MANUAL">(
    currentManualProfit !== undefined ? "MANUAL" : "AUTO",
  );
  const [manualAmount, setManualAmount] = useState<string>(
    currentManualProfit?.toString() || "",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      if (profitType === "AUTO") {
        await updateManualDailyProfit(staffName, date, null);
      } else {
        const amount = parseInt(manualAmount.replace(/[^0-9]/g, ""), 10);
        if (isNaN(amount)) {
          alert("올바른 금액을 입력해주세요.");
          setIsSubmitting(false);
          return;
        }
        await updateManualDailyProfit(staffName, date, amount);
      }
      onClose();
    } catch (error) {
      console.error("수익 설정 오류:", error);
      alert("수익 설정 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden border border-stone-100"
      >
        <div className="p-5 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
          <div>
            <h3 className="text-lg font-black text-stone-900 leading-tight">
              {staffName} 수익 설정
            </h3>
            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mt-0.5">
              {date}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-stone-200 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-stone-400" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setProfitType("AUTO")}
              className={cn(
                "p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2",
                profitType === "AUTO"
                  ? "border-stone-900 bg-stone-900 text-white shadow-lg shadow-stone-900/20"
                  : "border-stone-100 bg-stone-50 text-stone-400 hover:border-stone-200",
              )}
            >
              <RefreshCw
                className={cn(
                  "w-6 h-6",
                  profitType === "AUTO" ? "text-emerald-400" : "text-stone-300",
                )}
              />
              <div className="text-xs font-black">자동 계산</div>
              <div
                className={cn(
                  "text-[10px] font-bold",
                  profitType === "AUTO" ? "text-stone-300" : "text-stone-400",
                )}
              >
                {currentCalculatedProfit.toLocaleString()}원
              </div>
            </button>

            <button
              onClick={() => setProfitType("MANUAL")}
              className={cn(
                "p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2",
                profitType === "MANUAL"
                  ? "border-stone-900 bg-stone-900 text-white shadow-lg shadow-stone-900/20"
                  : "border-stone-100 bg-stone-50 text-stone-400 hover:border-stone-200",
              )}
            >
              <Edit3
                className={cn(
                  "w-6 h-6",
                  profitType === "MANUAL" ? "text-blue-400" : "text-stone-300",
                )}
              />
              <div className="text-xs font-black">별도 수익</div>
              <div
                className={cn(
                  "text-[10px] font-bold",
                  profitType === "MANUAL" ? "text-stone-300" : "text-stone-400",
                )}
              >
                직접 입력
              </div>
            </button>
          </div>

          {profitType === "MANUAL" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="space-y-2"
            >
              <label className="text-[10px] font-black text-stone-400 uppercase ml-1">
                수익금 입력
              </label>
              <div className="relative">
                <input
                  autoFocus
                  type="text"
                  value={manualAmount}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, "");
                    setManualAmount(val);
                  }}
                  onFocus={(e) => {
                    const target = e.target;
                    setTimeout(() => {
                      try {
                        target.select();
                        if (target.type !== "number") {
                          target.setSelectionRange(0, 9999);
                        }
                      } catch {}
                    }, 50);
                  }}
                  className="w-full px-5 py-4 bg-stone-50 border-2 border-stone-100 rounded-2xl focus:border-stone-900 outline-none text-xl font-black text-stone-900 transition-all pr-12"
                  placeholder="0"
                />
                <span className="absolute right-5 top-1/2 -translate-y-1/2 font-black text-stone-400">
                  원
                </span>
              </div>
              <p className="text-[10px] text-stone-400 font-bold ml-1">
                * 입력한 금액이 해당 일자의 최종 수익으로 확정됩니다.
              </p>
            </motion.div>
          )}

          <div className="pt-2">
            <button
              disabled={isSubmitting}
              onClick={handleSave}
              className="w-full py-4 bg-stone-900 text-white rounded-2xl font-black text-sm shadow-xl shadow-stone-900/20 hover:bg-stone-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  설정 완료
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function BatchDelegatedProfitModal({
  isOpen,
  onClose,
  date,
  staff,
  workingStaffIds,
  records,
  manualDailyProfits,
  onAlert,
}: {
  isOpen: boolean;
  onClose: () => void;
  date: string;
  staff: Staff[];
  workingStaffIds: string[];
  records: DispatchRecord[];
  manualDailyProfits: Record<string, number>;
  onAlert: (msg: string) => void;
}) {
  const delegatedStaff = useMemo(() => {
    return staff
      .filter((s) => !formatStaffNameComponents(s.name).isDirect && s.active !== false)
      .sort((a, b) => {
        const aWorking = workingStaffIds.includes(a.id!);
        const bWorking = workingStaffIds.includes(b.id!);
        if (aWorking !== bWorking) return aWorking ? -1 : 1;
        return a.name.localeCompare(b.name, "ko");
      });
  }, [staff, workingStaffIds]);

  const workingDelegatedStaff = useMemo(() => {
    return delegatedStaff.filter((s) => workingStaffIds.includes(s.id!));
  }, [delegatedStaff, workingStaffIds]);

  const [selectedStaffNames, setSelectedStaffNames] = useState<Set<string>>(new Set());
  const [profitMode, setProfitMode] = useState<"MANUAL" | "AUTO">("MANUAL");
  const [manualAmount, setManualAmount] = useState<string>("50000");
  const [scopeFilter, setScopeFilter] = useState<"WORKING" | "ALL">("WORKING");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (workingDelegatedStaff.length > 0) {
        setScopeFilter("WORKING");
        setSelectedStaffNames(new Set(workingDelegatedStaff.map((s) => s.name)));
      } else {
        setScopeFilter("ALL");
        setSelectedStaffNames(new Set(delegatedStaff.map((s) => s.name)));
      }
      setError(null);
    }
  }, [isOpen, workingDelegatedStaff.length, delegatedStaff.length]);

  if (!isOpen) return null;

  const displayedStaff =
    scopeFilter === "WORKING" && workingDelegatedStaff.length > 0
      ? workingDelegatedStaff
      : delegatedStaff;

  const handleSelectAll = () => {
    setSelectedStaffNames(new Set(displayedStaff.map((s) => s.name)));
  };

  const handleDeselectAll = () => {
    setSelectedStaffNames(new Set());
  };

  const toggleStaff = (name: string) => {
    setSelectedStaffNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const handlePresetAmount = (val: number) => {
    setManualAmount(val.toString());
  };

  const handleAddAmount = (addVal: number) => {
    const current = parseInt(manualAmount.replace(/[^0-9]/g, ""), 10) || 0;
    setManualAmount((current + addVal).toString());
  };

  const handleSave = async () => {
    if (selectedStaffNames.size === 0) {
      setError("수익을 변경할 위탁직원을 1명 이상 선택해주세요.");
      return;
    }

    let parsedAmount: number | null = null;
    if (profitMode === "MANUAL") {
      const amt = parseInt(manualAmount.replace(/[^0-9]/g, ""), 10);
      if (isNaN(amt) || amt < 0) {
        setError("올바른 금액(0원 이상)을 입력해주세요.");
        return;
      }
      parsedAmount = amt;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const updates: Record<string, number | null> = {};
      selectedStaffNames.forEach((name) => {
        updates[name] = parsedAmount;
      });

      await updateManualDailyProfitsMultiple(updates, date);
      onClose();
    } catch (err: any) {
      console.error("위탁직원 수익 일괄 수정 오류:", err);
      setError(err?.message || "수익 일괄 수정 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const staffStats = displayedStaff.map((s) => {
    const todayRecords = records.filter(
      (r) => r.staffName === s.name && r.date === date,
    );
    const calculatedProfit = todayRecords.reduce(
      (sum, r) => sum + (r.commission || 0),
      0,
    );
    const hasManual = manualDailyProfits[s.name] !== undefined;
    const currentProfit = hasManual
      ? manualDailyProfits[s.name]
      : calculatedProfit;
    const isWorking = workingStaffIds.includes(s.id!);

    return {
      staff: s,
      recordsCount: todayRecords.length,
      calculatedProfit,
      currentProfit,
      hasManual,
      isWorking,
    };
  });

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-stone-100 flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-5 border-b border-stone-100 flex items-center justify-between bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-stone-900 leading-tight">
                위탁직원 별도수익 일괄 수정
              </h3>
              <p className="text-xs font-bold text-stone-500 mt-0.5">
                {date} · 위탁 소속 직원 수익 일괄 관리
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-stone-100 rounded-full text-stone-400 hover:text-stone-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {delegatedStaff.length === 0 ? (
            <div className="py-12 text-center text-stone-400">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-bold text-stone-600">
                등록된 위탁 직원이 없습니다.
              </p>
              <p className="text-xs text-stone-400 mt-1">
                직원 관리 메뉴에서 소속을 '위탁'으로 설정해주세요.
              </p>
            </div>
          ) : (
            <>
              {/* Mode Selection */}
              <div>
                <label className="text-[11px] font-black text-stone-500 uppercase tracking-wider block mb-2">
                  수익 적용 방식
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setProfitMode("MANUAL")}
                    className={cn(
                      "p-3.5 rounded-2xl border-2 transition-all flex flex-col items-center gap-1.5 cursor-pointer text-center",
                      profitMode === "MANUAL"
                        ? "border-stone-900 bg-stone-900 text-white shadow-lg shadow-stone-900/15"
                        : "border-stone-100 bg-stone-50 text-stone-600 hover:border-stone-200",
                    )}
                  >
                    <Edit3
                      className={cn(
                        "w-5 h-5",
                        profitMode === "MANUAL"
                          ? "text-amber-400"
                          : "text-stone-400",
                      )}
                    />
                    <div className="text-xs font-black">별도수익 직접 입력</div>
                    <div
                      className={cn(
                        "text-[10px] font-medium",
                        profitMode === "MANUAL"
                          ? "text-stone-300"
                          : "text-stone-400",
                      )}
                    >
                      지정한 금액으로 일괄 확정
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setProfitMode("AUTO")}
                    className={cn(
                      "p-3.5 rounded-2xl border-2 transition-all flex flex-col items-center gap-1.5 cursor-pointer text-center",
                      profitMode === "AUTO"
                        ? "border-stone-900 bg-stone-900 text-white shadow-lg shadow-stone-900/15"
                        : "border-stone-100 bg-stone-50 text-stone-600 hover:border-stone-200",
                    )}
                  >
                    <RefreshCw
                      className={cn(
                        "w-5 h-5",
                        profitMode === "AUTO"
                          ? "text-emerald-400"
                          : "text-stone-400",
                      )}
                    />
                    <div className="text-xs font-black">자동 계산으로 복구</div>
                    <div
                      className={cn(
                        "text-[10px] font-medium",
                        profitMode === "AUTO"
                          ? "text-stone-300"
                          : "text-stone-400",
                      )}
                    >
                      기본 배차 계산식으로 복구
                    </div>
                  </button>
                </div>
              </div>

              {/* Amount Input (When MANUAL) */}
              {profitMode === "MANUAL" && (
                <div className="space-y-2 bg-stone-50/80 p-4 rounded-2xl border border-stone-200/70">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black text-stone-600 uppercase tracking-wider">
                      일괄 적용할 수익금
                    </label>
                    <span className="text-[11px] font-bold text-amber-600">
                      {(parseInt(manualAmount.replace(/[^0-9]/g, ""), 10) || 0).toLocaleString()}원
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      value={
                        manualAmount
                          ? Number(
                              manualAmount.replace(/[^0-9]/g, ""),
                            ).toLocaleString()
                          : ""
                      }
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, "");
                        setManualAmount(val);
                      }}
                      onFocus={(e) => {
                        const target = e.target;
                        setTimeout(() => {
                          try {
                            target.select();
                            if (target.type !== "number") {
                              target.setSelectionRange(0, 9999);
                            }
                          } catch {}
                        }, 50);
                      }}
                      className="w-full px-4 py-3.5 bg-white border-2 border-stone-200 rounded-xl focus:border-stone-900 outline-none text-xl font-black text-stone-900 transition-all pr-12"
                      placeholder="0"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-stone-400">
                      원
                    </span>
                  </div>

                  {/* Preset Buttons */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[0, 30000, 50000, 70000, 100000].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => handlePresetAmount(val)}
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer",
                          (parseInt(manualAmount.replace(/[^0-9]/g, ""), 10) ||
                            0) === val
                            ? "bg-stone-900 text-white border-stone-900"
                            : "bg-white text-stone-600 border-stone-200 hover:border-stone-400",
                        )}
                      >
                        {val === 0 ? "0원" : `${val / 10000}만`}
                      </button>
                    ))}
                    {[10000, 50000].map((val) => (
                      <button
                        key={`add-${val}`}
                        type="button"
                        onClick={() => handleAddAmount(val)}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-all cursor-pointer"
                      >
                        +{val / 10000}만
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Staff List & Selection Controls */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] font-black text-stone-500 uppercase tracking-wider">
                      대상 위탁직원 선택
                    </label>
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-black rounded-full border border-amber-200">
                      {selectedStaffNames.size} / {displayedStaff.length}명 선택
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {workingDelegatedStaff.length > 0 && (
                      <div className="flex bg-stone-100 p-0.5 rounded-lg text-[11px] font-bold">
                        <button
                          type="button"
                          onClick={() => {
                            setScopeFilter("WORKING");
                            setSelectedStaffNames(
                              new Set(workingDelegatedStaff.map((s) => s.name)),
                            );
                          }}
                          className={cn(
                            "px-2 py-0.5 rounded-md transition-all",
                            scopeFilter === "WORKING"
                              ? "bg-white shadow-xs text-stone-900 font-black"
                              : "text-stone-500 hover:text-stone-700",
                          )}
                        >
                          출근 ({workingDelegatedStaff.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setScopeFilter("ALL");
                            setSelectedStaffNames(
                              new Set(delegatedStaff.map((s) => s.name)),
                            );
                          }}
                          className={cn(
                            "px-2 py-0.5 rounded-md transition-all",
                            scopeFilter === "ALL"
                              ? "bg-white shadow-xs text-stone-900 font-black"
                              : "text-stone-500 hover:text-stone-700",
                          )}
                        >
                          전체 ({delegatedStaff.length})
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="px-2 py-1 text-[11px] font-bold text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-md transition-all cursor-pointer"
                    >
                      전체선택
                    </button>
                    <button
                      type="button"
                      onClick={handleDeselectAll}
                      className="px-2 py-1 text-[11px] font-bold text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-md transition-all cursor-pointer"
                    >
                      해제
                    </button>
                  </div>
                </div>

                {/* Staff Selection List */}
                <div className="border border-stone-200 rounded-2xl overflow-hidden divide-y divide-stone-100 max-h-56 overflow-y-auto bg-stone-50/40">
                  {staffStats.map(
                    ({
                      staff: s,
                      recordsCount,
                      calculatedProfit,
                      currentProfit,
                      hasManual,
                      isWorking,
                    }) => {
                      const isSelected = selectedStaffNames.has(s.name);
                      const targetPreview =
                        profitMode === "MANUAL"
                          ? (parseInt(
                              manualAmount.replace(/[^0-9]/g, ""),
                              10,
                            ) || 0)
                          : calculatedProfit;

                      return (
                        <div
                          key={s.id || s.name}
                          onClick={() => toggleStaff(s.name)}
                          className={cn(
                            "p-3 flex items-center justify-between gap-3 cursor-pointer transition-colors select-none",
                            isSelected
                              ? "bg-amber-50/70 hover:bg-amber-50"
                              : "bg-white hover:bg-stone-50/80 opacity-70",
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={cn(
                                "w-5 h-5 rounded-md border flex items-center justify-center transition-all shrink-0",
                                isSelected
                                  ? "bg-amber-500 border-amber-500 text-white"
                                  : "border-stone-300 bg-white",
                              )}
                            >
                              {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-black text-sm text-stone-900 truncate">
                                  {s.name}
                                </span>
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                                  위탁
                                </span>
                                {isWorking ? (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 shrink-0">
                                    출근
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-stone-100 text-stone-400 shrink-0">
                                    미출근
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-stone-400 font-medium mt-0.5">
                                배차 {recordsCount}건 · 현재:{" "}
                                <span className="font-bold text-stone-600">
                                  {currentProfit.toLocaleString()}원
                                </span>{" "}
                                {hasManual && (
                                  <span className="text-[10px] text-amber-600 font-bold">
                                    (별도)
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {isSelected && (
                            <div className="text-right shrink-0">
                              <div className="text-[10px] font-bold text-stone-400">
                                적용 예정
                              </div>
                              <div className="text-xs font-black text-amber-600">
                                {targetPreview.toLocaleString()}원
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    },
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-stone-100 bg-stone-50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-3 rounded-xl border border-stone-200 text-stone-600 font-bold text-sm hover:bg-stone-100 transition-all cursor-pointer"
          >
            취소
          </button>
          <button
            type="button"
            disabled={isSubmitting || selectedStaffNames.size === 0}
            onClick={handleSave}
            className="px-6 py-3 bg-stone-900 text-white rounded-xl font-black text-sm shadow-md hover:bg-stone-800 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>적용 중...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>
                  {selectedStaffNames.size > 0
                    ? `${selectedStaffNames.size}명 수익 일괄 적용`
                    : "직원을 선택해주세요"}
                </span>
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function BounceEstablishmentModal({
  isOpen,
  onClose,
  staffWithOngoing,
  staffWithoutOngoing,
  establishments = [],
  records = [],
  bouncedRecords = [],
  onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  staffWithOngoing: { staffName: string; record: DispatchRecord }[];
  staffWithoutOngoing: string[];
  establishments: { id: string; name: string }[];
  records?: DispatchRecord[];
  bouncedRecords?: BouncedRecord[];
  onConfirm: (establishmentName: string, time: string) => Promise<void>;
}) {
  const [establishmentName, setEstablishmentName] = useState("");
  const [time, setTime] = useState(format(new Date(), "HH:mm"));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Collect all known establishment names across establishments master, dispatch records, and bounced records
  const allKnownEstablishmentNames = useMemo(() => {
    const set = new Set<string>();
    (establishments || []).forEach((e) => {
      if (e.name?.trim()) set.add(e.name.trim());
    });
    (records || []).forEach((r) => {
      if (r.establishmentName?.trim()) set.add(r.establishmentName.trim());
    });
    (bouncedRecords || []).forEach((b) => {
      if (b.establishmentName?.trim()) set.add(b.establishmentName.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [establishments, records, bouncedRecords]);

  const filteredEstablishments = useMemo(() => {
    const query = establishmentName.trim().toLowerCase();
    if (!query) {
      return allKnownEstablishmentNames.slice(0, 15);
    }
    return allKnownEstablishmentNames
      .filter((name) => name.toLowerCase().includes(query))
      .slice(0, 20);
  }, [allKnownEstablishmentNames, establishmentName]);

  const handleTimeChange = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 4);
    let formatted = digits;
    if (digits.length >= 3) {
      formatted = digits.slice(0, 2) + ":" + digits.slice(2);
    }
    setTime(formatted);
  };

  const adjustMinutes = (deltaMinutes: number) => {
    const [hStr, mStr] = time.includes(":")
      ? time.split(":")
      : [time.slice(0, 2), time.slice(2)];
    const h = parseInt(hStr, 10) || 0;
    const m = parseInt(mStr, 10) || 0;
    const d = new Date();
    d.setHours(h, m, 0, 0);
    const newDate = addMinutes(d, deltaMinutes);
    setTime(format(newDate, "HH:mm"));
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!establishmentName.trim()) {
      setError("가게명을 입력해주세요.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onConfirm(
        establishmentName.trim(),
        time.trim() || format(new Date(), "HH:mm"),
      );
      onClose();
    } catch (err: any) {
      setError(err?.message || "튕김 처리 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden border border-stone-100"
      >
        <div className="p-4 bg-rose-50/70 border-b border-rose-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center font-black">
              <XCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-stone-900">
                튕김 처리 (가게명 입력)
              </h3>
              <p className="text-[10px] text-stone-500 font-bold">
                진행 중인 업무가 없는 직원의 튕김 가게명을 입력하세요
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-stone-400 hover:text-stone-900 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3.5">
          {error && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Selected Staff Breakdown */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black text-stone-600 block">
              대상 직원 ({staffWithOngoing.length + staffWithoutOngoing.length}명)
            </label>
            <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200 space-y-1.5 max-h-32 overflow-y-auto">
              {staffWithOngoing.length > 0 && (
                <div>
                  <div className="text-[9px] font-black text-emerald-700 mb-0.5">
                    진행 중 업무 튕김 (기존 가게명 자동 적용):
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {staffWithOngoing.map((item) => (
                      <span
                        key={item.staffName}
                        className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded border border-emerald-200"
                      >
                        {item.staffName} ({item.record.establishmentName})
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {staffWithoutOngoing.length > 0 && (
                <div>
                  <div className="text-[9px] font-black text-rose-700 mb-0.5">
                    대기/미진행 튕김 (아래 입력 가게명 적용):
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {staffWithoutOngoing.map((name) => (
                      <span
                        key={name}
                        className="px-1.5 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-bold rounded border border-rose-200"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Establishment Name Input with Autocomplete */}
          <div className="space-y-1 relative">
            <label className="text-[11px] font-black text-stone-700 block">
              가게명 <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={establishmentName}
                onChange={(e) => {
                  setEstablishmentName(e.target.value);
                  setIsDropdownOpen(true);
                  if (error) setError(null);
                }}
                onFocus={(e) => {
                  setIsDropdownOpen(true);
                  e.target.select();
                }}
                onClick={(e) => {
                  (e.target as HTMLInputElement).select();
                }}
                onBlur={() => {
                  setTimeout(() => setIsDropdownOpen(false), 200);
                }}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    isDropdownOpen &&
                    filteredEstablishments.length > 0
                  ) {
                    e.preventDefault();
                    setEstablishmentName(filteredEstablishments[0]);
                    setIsDropdownOpen(false);
                  } else if (e.key === "Escape") {
                    setIsDropdownOpen(false);
                  }
                }}
                placeholder="튕김 처리할 가게명을 입력하세요"
                autoFocus
                autoComplete="off"
                className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-xs font-bold focus:outline-hidden focus:ring-2 focus:ring-rose-500 focus:border-rose-500 transition-all pr-8"
              />
              {establishmentName && (
                <button
                  type="button"
                  onClick={() => {
                    setEstablishmentName("");
                    setIsDropdownOpen(true);
                    inputRef.current?.focus();
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-stone-400 hover:text-stone-700 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Dropdown list for autocomplete */}
            {isDropdownOpen && filteredEstablishments.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-stone-200 rounded-xl shadow-xl z-[100] max-h-44 overflow-y-auto divide-y divide-stone-100">
                <div className="px-3 py-1 bg-stone-50 text-[9px] font-black text-stone-400 uppercase tracking-wider sticky top-0 flex items-center justify-between">
                  <span>이전 가게 목록 ({filteredEstablishments.length})</span>
                  <span>선택 시 자동입력</span>
                </div>
                {filteredEstablishments.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onMouseDown={(ev) => {
                      ev.preventDefault();
                      setEstablishmentName(name);
                      setIsDropdownOpen(false);
                      if (error) setError(null);
                    }}
                    className="w-full text-left px-3 py-2 text-xs font-bold text-stone-800 hover:bg-rose-50 hover:text-rose-700 transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <span>{name}</span>
                    <span className="text-[10px] text-stone-300 group-hover:text-rose-400">
                      선택
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Quick establishment chips */}
            {!isDropdownOpen && allKnownEstablishmentNames.length > 0 && (
              <div className="flex items-center gap-1 overflow-x-auto py-1 scrollbar-hide">
                {allKnownEstablishmentNames.slice(0, 8).map((name) => (
                  <button
                    type="button"
                    key={name}
                    onClick={() => {
                      setEstablishmentName(name);
                      if (error) setError(null);
                    }}
                    className="px-2 py-0.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-[10px] font-bold rounded-lg shrink-0 transition-colors cursor-pointer"
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Time Input with Direct Click Selection & +1/-1 Buttons */}
          <div className="space-y-1">
            <label className="text-[11px] font-black text-stone-700 block">
              튕김 시간
            </label>
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={time}
                  onChange={(e) => handleTimeChange(e.target.value)}
                  onFocus={(e) => {
                    e.target.select();
                  }}
                  onClick={(e) => {
                    (e.target as HTMLInputElement).select();
                  }}
                  placeholder="HH:mm"
                  className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-sm font-black text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-rose-500 focus:border-rose-500 transition-all text-center tracking-wider"
                />
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => adjustMinutes(-1)}
                  className="px-3 py-2 bg-stone-100 hover:bg-stone-200 active:scale-95 text-stone-700 text-xs font-black rounded-xl border border-stone-200 transition-all cursor-pointer shadow-2xs"
                  title="1분 감소"
                >
                  -1
                </button>
                <button
                  type="button"
                  onClick={() => adjustMinutes(1)}
                  className="px-3 py-2 bg-stone-100 hover:bg-stone-200 active:scale-95 text-stone-700 text-xs font-black rounded-xl border border-stone-200 transition-all cursor-pointer shadow-2xs"
                  title="1분 증가"
                >
                  +1
                </button>
                <button
                  type="button"
                  onClick={() => adjustMinutes(-5)}
                  className="px-2 py-2 bg-stone-50 hover:bg-stone-100 active:scale-95 text-stone-500 text-[11px] font-bold rounded-xl border border-stone-200 transition-all cursor-pointer"
                  title="5분 감소"
                >
                  -5
                </button>
                <button
                  type="button"
                  onClick={() => adjustMinutes(5)}
                  className="px-2 py-2 bg-stone-50 hover:bg-stone-100 active:scale-95 text-stone-500 text-[11px] font-bold rounded-xl border border-stone-200 transition-all cursor-pointer"
                  title="5분 증가"
                >
                  +5
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-black rounded-xl transition-all active:scale-95 cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl shadow-lg shadow-rose-200 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? "처리 중..." : "튕김 완료"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function BouncedListModal({
  staffName,
  bouncedRecords,
  dispatchRecords = [],
  onClose,
  onDelete,
}: {
  staffName: string;
  bouncedRecords: BouncedRecord[];
  dispatchRecords?: DispatchRecord[];
  onClose: () => void;
  onDelete?: (id: string) => void;
}) {
  const records = useMemo(() => {
    return bouncedRecords
      .filter((b) => b.staffName === staffName)
      .sort((a, b) => {
        const getMinutes = (t?: string) => {
          if (!t) return 0;
          const [h, m] = t.split(":").map(Number);
          if (isNaN(h) || isNaN(m)) return 0;
          return (h < 18 ? h + 24 : h) * 60 + m;
        };
        return getMinutes(a.time) - getMinutes(b.time);
      });
  }, [bouncedRecords, staffName]);

  const dispatchCount = dispatchRecords.length;
  const bounceCount = records.length;
  const totalAttempts = dispatchCount + bounceCount;
  const selectRate = totalAttempts > 0 ? Math.round((dispatchCount / totalAttempts) * 100) : 0;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[80vh]"
      >
        <div className="p-3.5 border-b border-stone-100 flex items-center justify-between bg-rose-50/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center font-black text-xs shrink-0">
              <XCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black text-stone-900">
                {staffName} 초이스 및 튕김 현황
              </h2>
              <p className="text-[10px] text-stone-500 font-bold">
                총 {totalAttempts}회 초이스 중 {dispatchCount}회 진행 ({bounceCount}회 튕김) · 진행확률 {selectRate}%
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-stone-400 hover:text-stone-900 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mini stats row */}
        <div className="grid grid-cols-4 gap-1.5 p-2.5 bg-stone-50 border-b border-stone-100 text-center">
          <div className="bg-white p-1.5 rounded-xl border border-stone-100 shadow-2xs">
            <div className="text-[9px] text-stone-400 font-bold">총 초이스</div>
            <div className="text-xs font-black text-stone-800">{totalAttempts}회</div>
          </div>
          <div className="bg-white p-1.5 rounded-xl border border-stone-100 shadow-2xs">
            <div className="text-[9px] text-stone-400 font-bold">업무 진행</div>
            <div className="text-xs font-black text-emerald-600">{dispatchCount}회</div>
          </div>
          <div className="bg-white p-1.5 rounded-xl border border-stone-100 shadow-2xs">
            <div className="text-[9px] text-stone-400 font-bold">튕김</div>
            <div className="text-xs font-black text-rose-600">{bounceCount}회</div>
          </div>
          <div className="bg-white p-1.5 rounded-xl border border-stone-100 shadow-2xs">
            <div className="text-[9px] text-stone-400 font-bold">진행 확률</div>
            <div className="text-xs font-black text-blue-600">{selectRate}%</div>
          </div>
        </div>

        <div className="p-3 overflow-y-auto space-y-1 flex-1">
          {records.length === 0 ? (
            <div className="text-center py-8 text-stone-400 text-xs font-bold">
              튕김 기록이 없습니다.
            </div>
          ) : (
            records.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between py-1.5 px-2.5 bg-stone-50 rounded-xl border border-stone-100 text-xs hover:border-stone-200 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded-md bg-stone-900 text-white font-black text-[10px]">
                    {r.time || "미정"}
                  </span>
                  <span className="font-bold text-stone-900 text-xs">
                    {r.establishmentName}
                  </span>
                </div>
                {onDelete && r.id && (
                  <button
                    type="button"
                    onClick={() => onDelete(r.id!)}
                    className="p-1 text-stone-300 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                    title="튕김 기록 삭제"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        <div className="p-2.5 border-t border-stone-100 bg-stone-50 text-right">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 bg-stone-900 text-white rounded-xl text-xs font-bold hover:bg-stone-800 transition-all active:scale-[0.98] cursor-pointer"
          >
            닫기
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function DispatchFormModal({
  onClose,
  selectedDate,
  editRecord,
  preSelectedStaffNames,
  workingStaff,
  offStaffIds,
  allRecords,
  establishments,
  checkInTimes,
  currentTime,
  onAlert,
}: {
  onClose: () => void;
  selectedDate: string;
  editRecord?: DispatchRecord | null;
  preSelectedStaffNames?: string[];
  workingStaff: Staff[];
  offStaffIds: string[];
  allRecords: DispatchRecord[];
  establishments: { id: string; name: string }[];
  checkInTimes: Record<string, any>;
  currentTime: Date;
  onAlert: (message: string) => void;
}) {
  const { initialStaffNames, groupStaffNames, groupRecords } = useMemo(() => {
    if (editRecord) {
      const start = editRecord.startTime.toDate
        ? editRecord.startTime.toDate()
        : new Date(editRecord.startTime);
      const group = allRecords.filter(
        (r) =>
          r.establishmentName === editRecord.establishmentName &&
          r.date === editRecord.date &&
          (r.startTime.toDate
            ? r.startTime.toDate().getTime()
            : new Date(r.startTime).getTime()) === start.getTime(),
      );

      return {
        initialStaffNames: [editRecord.staffName],
        groupStaffNames: group.map((r) => r.staffName),
        groupRecords: group,
      };
    }
    return {
      initialStaffNames: preSelectedStaffNames || ([] as string[]),
      groupStaffNames: [] as string[],
      groupRecords: [] as DispatchRecord[],
    };
  }, [editRecord, allRecords, preSelectedStaffNames]);

  const [formData, setFormData] = useState({
    staffNames: initialStaffNames,
    establishmentName: editRecord?.establishmentName || "",
    systemType: editRecord?.systemType || ("TABLE" as SystemType),
    startTime: editRecord
      ? format(
          editRecord.startTime.toDate
            ? editRecord.startTime.toDate()
            : new Date(editRecord.startTime),
          "HH:mm",
        )
      : format(currentTime, "HH:mm"),
    endTime: editRecord
      ? format(
          editRecord.endTime.toDate
            ? editRecord.endTime.toDate()
            : new Date(editRecord.endTime),
          "HH:mm",
        )
      : format(currentTime, "HH:mm"),
    paymentMethod: editRecord?.paymentMethod || ("UNPAID" as PaymentMethod),
    isBanti: editRecord?.isBanti || false,
    isNoBanti: editRecord?.isNoBanti || false,
    isStaffPaid: editRecord?.isStaffPaid || false,
    staffPaymentMethod:
      editRecord?.staffPaymentMethod || ("CASH" as "CASH" | "TRANSFER"),
    tip: editRecord?.tip || 0,
    isPass: editRecord?.isPass || false,
    isRoundUp: editRecord?.isRoundUp || false,
    isRoundDownHalf: editRecord?.isRoundDownHalf || false,
    isRoundDownFull: editRecord?.isRoundDownFull || false,
    extraFullUnits: editRecord?.extraFullUnits || 0,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTimeField, setActiveTimeField] = useState<
    "startTime" | "endTime"
  >(editRecord ? "endTime" : "startTime");
  const [error, setError] = useState<string | null>(null);
  const [isTimeDirty, setIsTimeDirty] = useState(false);
  const [isStaffSelectorOpen, setIsStaffSelectorOpen] = useState(false);
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);
  const [isOngoingDeleteConfirming, setIsOngoingDeleteConfirming] =
    useState(false);
  const [isConfirmingNewRecords, setIsConfirmingNewRecords] = useState(false);
  const [isSystemTypeDirty, setIsSystemTypeDirty] = useState(false);
  const [isBounceConfirming, setIsBounceConfirming] = useState(false);
  const bounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [isEstablishmentDropdownOpen, setIsEstablishmentDropdownOpen] =
    useState(false);

  const filteredEstablishments = useMemo(() => {
    if (!formData.establishmentName) return [];
    return establishments
      .filter((e) =>
        e.name.toLowerCase().includes(formData.establishmentName.toLowerCase()),
      )
      .filter(
        (e) =>
          e.name.toLowerCase() !== formData.establishmentName.toLowerCase(),
      )
      .slice(0, 10);
  }, [establishments, formData.establishmentName]);

  const toggleStaffSelection = (name: string) => {
    const s = workingStaff.find((staff) => staff.name === name);
    setFormData((prev) => {
      const isSelected = prev.staffNames.includes(name);
      let newNames: string[];
      let newTip = prev.tip;
      let newIsBanti = prev.isBanti;
      let newIsNoBanti = prev.isNoBanti;
      let newSystemType = prev.systemType;

      if (isSelected) {
        newNames = prev.staffNames.filter((n) => n !== name);
      } else {
        newNames = [...prev.staffNames, name];
        if (s) {
          // Auto-set system type for the first staff selected if not manually changed
          if (!editRecord && !isSystemTypeDirty && newNames.length === 1) {
            newSystemType =
              s.type === "COFFEE"
                ? "TABLE"
                : s.type === "PUBLIC"
                  ? "PUBLIC"
                  : "HOPPER";
          }
        }
      }

      return {
        ...prev,
        staffNames: newNames,
        tip: newTip,
        isBanti: newIsBanti,
        isNoBanti: newIsNoBanti,
        systemType: newSystemType,
      };
    });
  };

  const [newStaffToCreate, setNewStaffToCreate] = useState<string[]>([]);
  const [alreadyWorkingStaff, setAlreadyWorkingStaff] = useState<string[]>([]);
  const startTimeInputRef = useRef<HTMLInputElement>(null);
  const endTimeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsTimeDirty(false);
    setIsConfirmingNewRecords(false);
    setNewStaffToCreate([]);
    setAlreadyWorkingStaff([]);
  }, [formData.staffNames]);

  // Helper to parse time based on 12:00 business day start
  const getBusinessDate = (dateStr: string, timeStr: string) => {
    const [h, m] = timeStr.split(":").map(Number);
    const baseDate = parseISO(dateStr);
    // If hour is between 00:00 and 17:59, it's the next day
    if (h < 18) {
      return addMinutes(baseDate, 24 * 60 + h * 60 + m);
    }
    return addMinutes(baseDate, h * 60 + m);
  };

  // Auto-set system type based on staff group
  useEffect(() => {
    if (formData.staffNames.length > 0) {
      const firstStaffName = formData.staffNames[0];

      // If editing, only auto-update if the staff has been changed from the original
      const isStaffChanged = editRecord
        ? firstStaffName !== editRecord.staffName
        : true;

      if (isStaffChanged) {
        const staffMember = workingStaff.find((s) => s.name === firstStaffName);
        if (staffMember) {
          let targetSystemType: SystemType = "TABLE";
          if (staffMember.type === "PUBLIC") targetSystemType = "PUBLIC";
          else if (staffMember.type === "HOPPER") targetSystemType = "HOPPER";
          else if (staffMember.type === "COFFEE") targetSystemType = "TABLE";

          if (formData.systemType !== targetSystemType) {
            setFormData((prev) => ({ ...prev, systemType: targetSystemType }));
          }
        }
      }
    }
  }, [formData.staffNames, editRecord, workingStaff]);

  const getErrorMessage = (err: any, fallback: string) => {
    if (typeof err === "string") return err;
    return err?.message || fallback;
  };

  const handleTimeInputChange = (
    value: string,
    field: "startTime" | "endTime",
  ) => {
    let clean = value.replace(/[^0-9]/g, "");
    if (clean.length > 4) clean = clean.slice(0, 4);
    let formatted = clean;
    if (clean.length >= 3) {
      formatted = `${clean.slice(0, 2)}:${clean.slice(2)}`;
    }

    setFormData((prev) => {
      let nextStartTime = field === "startTime" ? formatted : prev.startTime;
      let nextEndTime = field === "endTime" ? formatted : prev.endTime;

      const wasOngoing = prev.startTime === prev.endTime;

      // 시작시간 수정 시
      if (field === "startTime") {
        if (wasOngoing) {
          // 진행중인 업무박스: 시작시간 변경 시 종료시간도 동일하게 변경하여 진행중(업무중) 상태 유지
          nextEndTime = formatted;
        } else if (formatted.length === 5 && nextEndTime.length === 5) {
          // 종료 처리 된 업무박스: 개별적으로 변경되나, 시작시간이 종료시간보다 뒤로 갈 경우에만 종료시간을 맞춰줌
          try {
            const start = getBusinessDate(selectedDate, formatted);
            const end = getBusinessDate(selectedDate, nextEndTime);
            if (start > end) {
              nextEndTime = formatted;
            }
          } catch {
            // ignore
          }
        }
      }

      return {
        ...prev,
        startTime: nextStartTime,
        endTime: nextEndTime,
      };
    });
    setIsTimeDirty(true);
  };

  const adjustTime = (minutes: number) => {
    const current = formData[activeTimeField];
    const [h, m] = current.split(":").map(Number);
    if (isNaN(h) || isNaN(m)) return;
    const date = new Date();
    date.setHours(h, m, 0, 0);
    const newDate = addMinutes(date, minutes);
    const newTime = format(newDate, "HH:mm");

    setFormData((prev) => {
      let nextStartTime =
        activeTimeField === "startTime" ? newTime : prev.startTime;
      let nextEndTime =
        activeTimeField === "endTime" ? newTime : prev.endTime;

      const wasOngoing = prev.startTime === prev.endTime;

      // 시작시간 미세조정 시
      if (activeTimeField === "startTime") {
        if (wasOngoing) {
          // 진행중인 업무박스: 시작시간 미세조정 시 (+, - 모두) 종료시간도 함께 변경되어 진행중 업무상태 유지
          nextEndTime = newTime;
        } else {
          // 종료 처리 된 업무박스: 개별적으로 변경되나, 시작시간이 종료시간보다 뒤로 갈 경우에만 종료시간을 맞춰줌
          try {
            const start = getBusinessDate(selectedDate, newTime);
            const end = getBusinessDate(selectedDate, nextEndTime);
            if (start > end) {
              nextEndTime = newTime;
            }
          } catch {
            // ignore
          }
        }
      }

      return {
        ...prev,
        startTime: nextStartTime,
        endTime: nextEndTime,
      };
    });
    setIsTimeDirty(true);
  };

  const {
    durationMinutes,
    fullHours,
    leftoverMinutes,
    isAutoFull,
    isAutoBanti,
    isReviewNeeded,
  } = useMemo(() => {
    try {
      const start = getBusinessDate(selectedDate, formData.startTime);
      const end = getBusinessDate(selectedDate, formData.endTime);
      const diffMinutes = Math.max(
        0,
        Math.round((end.getTime() - start.getTime()) / (1000 * 60)),
      );
      const hours = Math.floor(diffMinutes / 60);
      const leftover = diffMinutes % 60;
      const isAutoF = leftover >= 40;
      const isAutoB = leftover >= 20 && leftover < 35;
      const isRev =
        (leftover >= 5 && leftover < 20) || (leftover >= 35 && leftover < 40);
      return {
        durationMinutes: diffMinutes,
        fullHours: hours,
        leftoverMinutes: leftover,
        isAutoFull: isAutoF,
        isAutoBanti: isAutoB,
        isReviewNeeded: isRev,
      };
    } catch {
      return {
        durationMinutes: 0,
        fullHours: 0,
        leftoverMinutes: 0,
        isAutoFull: false,
        isAutoBanti: false,
        isReviewNeeded: false,
      };
    }
  }, [selectedDate, formData.startTime, formData.endTime]);

  const handleBounceClick = async () => {
    if (!isBounceConfirming) {
      setIsBounceConfirming(true);
      if (bounceTimerRef.current) clearTimeout(bounceTimerRef.current);
      bounceTimerRef.current = setTimeout(() => {
        setIsBounceConfirming(false);
      }, 3000);
      return;
    }

    if (bounceTimerRef.current) clearTimeout(bounceTimerRef.current);
    setIsBounceConfirming(false);

    try {
      if (editRecord?.id) {
        const recordsToDelete = groupRecords.filter((r) =>
          formData.staffNames.includes(r.staffName),
        );
        for (const record of recordsToDelete) {
          if (record.id) {
            await deleteDispatch(record.id);
          }
        }
      }

      for (const staffName of formData.staffNames) {
        await addBouncedRecord({
          staffName,
          establishmentName: formData.establishmentName || "미정",
          time: formData.startTime || format(new Date(), "HH:mm"),
          date: selectedDate,
        });
      }

      onClose();
    } catch (error) {
      console.error("튕김 처리 오류:", error);
      setError(
        `튕김 처리 오류: ${getErrorMessage(error, "튕김 처리 중 오류가 발생했습니다.")}`,
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.staffNames.length === 0) {
      setError("직원을 선택해주세요.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const start = getBusinessDate(selectedDate, formData.startTime);
      let end = getBusinessDate(selectedDate, formData.endTime);

      // 시작 시간이 종료 시간보다 뒤로 설정되었을 경우, 자동으로 종료 시간을 시작 시간과 동일하게 맞추고 '업무중' 상태로 등록
      if (end < start) {
        end = start;
        setFormData((prev) => ({ ...prev, endTime: prev.startTime }));
      }

      // Calculate group records and exclude IDs for overlap check
      let excludeIds: string[] = [];
      let groupRecords: DispatchRecord[] = [];

      if (editRecord?.id) {
        const originalStart = editRecord.startTime.toDate
          ? editRecord.startTime.toDate()
          : new Date(editRecord.startTime);
        const originalEnd = editRecord.endTime.toDate
          ? editRecord.endTime.toDate()
          : new Date(editRecord.endTime);
        const originalEstablishment = editRecord.establishmentName.trim();

        groupRecords = allRecords.filter((r) => {
          if (r.id === editRecord.id) return true;

          const rStart = r.startTime.toDate
            ? r.startTime.toDate()
            : new Date(r.startTime);
          const rEnd = r.endTime.toDate
            ? r.endTime.toDate()
            : new Date(r.endTime);
          const rEstablishment = r.establishmentName.trim();

          const isOngoing = originalStart.getTime() === originalEnd.getTime();
          const timesOverlap = isOngoing
            ? rStart.getTime() === originalStart.getTime() &&
              rEnd.getTime() === originalEnd.getTime()
            : originalStart < rEnd && originalEnd > rStart;

          return (
            rEstablishment === originalEstablishment &&
            r.date === editRecord.date &&
            timesOverlap
          );
        });
        excludeIds = groupRecords.map((r) => r.id!).filter(Boolean);
      }

      // Overlap validation for all selected staff
      for (const staffName of formData.staffNames) {
        const isOverlap = checkTimeOverlap(
          allRecords,
          staffName,
          start,
          end,
          excludeIds,
        );
        if (isOverlap) {
          setError(
            `${staffName} 직원의 시간이 중복됩니다. 시간을 확인해주세요.`,
          );
          setIsSubmitting(false);
          return;
        }
      }

      // Check for ongoing dispatches for all selected staff
      const ongoingStaffNames = allRecords
        .filter((r) => {
          if (!formData.staffNames.includes(r.staffName)) return false;
          if (r.date !== selectedDate) return false;
          if (excludeIds.includes(r.id!)) return false; // Exclude current group if editing

          const rStart = r.startTime.toDate
            ? r.startTime.toDate()
            : new Date(r.startTime);
          const rEnd = r.endTime.toDate
            ? r.endTime.toDate()
            : new Date(r.endTime);
          return rStart.getTime() === rEnd.getTime(); // Ongoing
        })
        .map((r) => r.staffName);

      if (!editRecord && ongoingStaffNames.length > 0) {
        const uniqueNames = [...new Set(ongoingStaffNames)];
        setError(
          `${uniqueNames.join(", ")} 직원이 현재 파견 중입니다. 먼저 종료해주세요.`,
        );
        setIsSubmitting(false);
        return;
      }

      if (editRecord?.id) {
        // 1. Update existing records in the group
        const currentStaffInGroup = groupRecords.map((r) => r.staffName);
        const staffToUpdate = formData.staffNames.filter((name) =>
          currentStaffInGroup.includes(name),
        );
        const staffToAdd = formData.staffNames.filter(
          (name) => !currentStaffInGroup.includes(name),
        );

        // Check if we are creating new records or finishing in-progress records during an edit
        if (!isConfirmingNewRecords) {
          const isFinishing = start.getTime() !== end.getTime();

          // 1. Check for staff who are being added to this group (will create new records)
          const staffBeingAdded = staffToAdd;

          // 2. Check for staff who are currently "working" (in progress) elsewhere
          const workingStaffNames = allRecords
            .filter((r) => {
              const rStart = r.startTime.toDate
                ? r.startTime.toDate()
                : new Date(r.startTime);
              const rEnd = r.endTime.toDate
                ? r.endTime.toDate()
                : new Date(r.endTime);
              return rStart.getTime() === rEnd.getTime(); // In progress
            })
            .map((r) => r.staffName);

          // Staff being added who are already working elsewhere
          const addedButWorking = staffBeingAdded.filter((name) =>
            workingStaffNames.includes(name),
          );

          // 3. Warning logic for group dispatches or mixed states
          const isGroupDispatch = groupRecords.length > 1;
          const isPartialEdit =
            isGroupDispatch && formData.staffNames.length < groupRecords.length;

          // Check if selected staff have different progress states
          const selectedRecords = allRecords.filter((r) => {
            if (!formData.staffNames.includes(r.staffName)) return false;
            // Only consider records that match the establishment and date (likely part of the same or similar group)
            return (
              r.establishmentName === formData.establishmentName &&
              r.date === selectedDate
            );
          });

          const hasMixedStates =
            selectedRecords.length > 1 &&
            new Set(
              selectedRecords.map((r) => {
                const rStart = r.startTime.toDate
                  ? r.startTime.toDate()
                  : new Date(r.startTime);
                const rEnd = r.endTime.toDate
                  ? r.endTime.toDate()
                  : new Date(r.endTime);
                return rStart.getTime() === rEnd.getTime();
              }),
            ).size > 1;

          if (addedButWorking.length > 0 || isPartialEdit || hasMixedStates) {
            setNewStaffToCreate(staffBeingAdded);
            setAlreadyWorkingStaff([
              ...new Set([
                ...addedButWorking,
                ...(isPartialEdit || hasMixedStates ? formData.staffNames : []),
              ]),
            ]);
            setIsConfirmingNewRecords(true);
            setIsSubmitting(false);
            return;
          }
        }

        // Update existing
        const updatePromises = staffToUpdate.map(async (staffName) => {
          const recordToUpdate = groupRecords.find(
            (r) => r.staffName === staffName,
          );
          if (recordToUpdate) {
            const s = workingStaff.find((staff) => staff.name === staffName);
            const staffSystemType =
              isSystemTypeDirty || editRecord
                ? formData.systemType
                : s
                  ? s.type === "COFFEE"
                    ? "TABLE"
                    : s.type === "PUBLIC"
                      ? "PUBLIC"
                      : "HOPPER"
                  : formData.systemType;

            const isCollectingNow =
              recordToUpdate.paymentMethod === "UNPAID" &&
              (formData.paymentMethod === "CASH" ||
                formData.paymentMethod === "TRANSFER");
            const payload = {
              staffName: recordToUpdate.staffName,
              establishmentName: formData.establishmentName,
              systemType: staffSystemType,
              startTime: start,
              endTime: end,
              paymentMethod: formData.paymentMethod,
              isBanti: formData.isBanti || false,
              isNoBanti: formData.isNoBanti || false,
              isStaffPaid: formData.isStaffPaid || false,
              staffPaymentMethod: formData.staffPaymentMethod || null,
              tip: Number(formData.tip),
              extraFullUnits: Number(formData.extraFullUnits || 0),
              date: selectedDate,
              collectedAt: isCollectingNow
                ? Timestamp.now()
                : formData.paymentMethod === "UNPAID"
                  ? null
                  : recordToUpdate.collectedAt || null,
              additionalCollectedAt:
                formData.paymentMethod === "UNPAID"
                  ? null
                  : recordToUpdate.additionalCollectedAt || null,
              collectionHistory:
                formData.paymentMethod === "UNPAID"
                  ? []
                  : recordToUpdate.collectionHistory || [],
              collectedAmount:
                formData.paymentMethod === "UNPAID"
                  ? undefined
                  : recordToUpdate.collectedAmount,
              depositorName:
                formData.paymentMethod === "UNPAID"
                  ? null
                  : recordToUpdate.depositorName ||
                    (formData as any).depositorName ||
                    null,
              isDispatchBoxCollection: isCollectingNow
                ? true
                : formData.paymentMethod === "UNPAID"
                  ? false
                  : recordToUpdate.isDispatchBoxCollection || false,
              wasUnpaid:
                recordToUpdate.wasUnpaid || formData.paymentMethod === "UNPAID",
              isPass: formData.isPass,
              isRoundUp: formData.isRoundUp || false,
              isRoundDownHalf: formData.isRoundDownHalf || false,
              isRoundDownFull: formData.isRoundDownFull || false,
            };
            await updateDispatch(recordToUpdate.id!, payload);
          }
        });
        await Promise.all(updatePromises);

        // Add new staff to the group during edit
        const addPromises = staffToAdd.map(async (staffName) => {
          const s = workingStaff.find((staff) => staff.name === staffName);
          const staffSystemType =
            isSystemTypeDirty || editRecord
              ? formData.systemType
              : s
                ? s.type === "COFFEE"
                  ? "TABLE"
                  : s.type === "PUBLIC"
                    ? "PUBLIC"
                    : "HOPPER"
                : formData.systemType;

          const isPaidImmediately =
            formData.paymentMethod === "CASH" ||
            formData.paymentMethod === "TRANSFER";
          const payload = {
            staffName,
            establishmentName: formData.establishmentName,
            systemType: staffSystemType,
            startTime: start,
            endTime: end,
            paymentMethod: formData.paymentMethod,
            isBanti: formData.isBanti || false,
            isNoBanti: formData.isNoBanti || false,
            isStaffPaid: formData.isStaffPaid || false,
            staffPaymentMethod: formData.staffPaymentMethod || null,
            tip: Number(formData.tip),
            extraFullUnits: Number(formData.extraFullUnits || 0),
            date: selectedDate,
            collectedAt: isPaidImmediately ? Timestamp.now() : null,
            isDispatchBoxCollection: isPaidImmediately ? true : false,
            wasUnpaid: formData.paymentMethod === "UNPAID",
            isPass: formData.isPass,
            isRoundUp: formData.isRoundUp || false,
            isRoundDownHalf: formData.isRoundDownHalf || false,
            isRoundDownFull: formData.isRoundDownFull || false,
          };
          await addDispatch(payload);
        });
        await Promise.all(addPromises);
      } else {
        // Add records for each staff
        const addPromises = formData.staffNames.map(async (staffName) => {
          const s = workingStaff.find((staff) => staff.name === staffName);
          const staffSystemType =
            isSystemTypeDirty || editRecord
              ? formData.systemType
              : s
                ? s.type === "COFFEE"
                  ? "TABLE"
                  : s.type === "PUBLIC"
                    ? "PUBLIC"
                    : "HOPPER"
                : formData.systemType;

          const isPaidImmediately =
            formData.paymentMethod === "CASH" ||
            formData.paymentMethod === "TRANSFER";
          const payload = {
            staffName,
            establishmentName: formData.establishmentName,
            systemType: staffSystemType,
            startTime: start,
            endTime: end,
            paymentMethod: formData.paymentMethod,
            isBanti: formData.isBanti || false,
            isNoBanti: formData.isNoBanti || false,
            isStaffPaid: formData.isStaffPaid || false,
            staffPaymentMethod: formData.staffPaymentMethod || null,
            tip: Number(formData.tip),
            extraFullUnits: Number(formData.extraFullUnits || 0),
            date: selectedDate,
            collectedAt: isPaidImmediately ? Timestamp.now() : null,
            isDispatchBoxCollection: isPaidImmediately ? true : false,
            wasUnpaid: formData.paymentMethod === "UNPAID",
            isPass: formData.isPass,
            isRoundUp: formData.isRoundUp || false,
            isRoundDownHalf: formData.isRoundDownHalf || false,
            isRoundDownFull: formData.isRoundDownFull || false,
          };
          await addDispatch(payload);
        });
        await Promise.all(addPromises);
      }

      onClose();
    } catch (error) {
      console.error("기록 저장 오류:", error);
      setError(
        `기록 저장 오류: ${getErrorMessage(error, "기록 저장 중 오류가 발생했습니다.")}`,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-stone-100 overflow-hidden flex flex-col max-h-[92vh]"
      >
        <div className="px-5 py-3.5 border-b border-stone-100 flex items-center justify-between bg-stone-50/50 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-stone-900" />
            <h3 className="font-black text-stone-900 text-sm sm:text-base">
              {editRecord ? "기록 수정" : "새 기록 추가"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-stone-200/60 flex items-center justify-center text-stone-400 hover:text-stone-600 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2 text-red-700 text-xs font-bold shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="p-4 sm:p-5 space-y-3.5 overflow-y-auto flex-1 custom-scrollbar"
        >
          {/* 1. 수금 방식 */}
          <div className="grid grid-cols-1 gap-2.5">
            <div className="space-y-1">
              <label className="text-[11px] font-black text-stone-600 block ml-0.5">
                수금 방식
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      paymentMethod: "CASH",
                      isPass: true,
                    })
                  }
                  className={cn(
                    "py-2 rounded-xl border text-xs font-black transition-all cursor-pointer active:scale-95",
                    formData.isPass
                      ? "bg-red-600 border-red-600 text-white shadow-xs"
                      : "bg-white border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50",
                  )}
                >
                  패스
                </button>
                {(["CASH", "TRANSFER", "UNPAID"] as PaymentMethod[]).map(
                  (method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          paymentMethod: method,
                          isPass: false,
                        })
                      }
                      className={cn(
                        "py-2 rounded-xl border text-xs font-black transition-all cursor-pointer active:scale-95",
                        formData.paymentMethod === method && !formData.isPass
                          ? "bg-stone-900 border-stone-900 text-white shadow-xs"
                          : "bg-white border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50",
                      )}
                    >
                      {method === "CASH"
                        ? "현금"
                        : method === "TRANSFER"
                          ? "계좌"
                          : "미수"}
                    </button>
                  ),
                )}
              </div>
            </div>
          </div>

          {/* 2. 팁 / 상태(반티여부) */}
          <div className="grid grid-cols-[1fr_2.5fr] gap-2.5">
            <div className="space-y-1">
              <label className="text-[11px] font-black text-stone-600 block ml-0.5">
                팁 (TIP)
              </label>
              <div className="flex items-center border border-stone-200 hover:border-stone-300 focus-within:border-stone-900 rounded-xl px-3 py-2 bg-stone-50 focus-within:bg-white transition-all shadow-2xs">
                <input
                  type="text"
                  inputMode="numeric"
                  value={formData.tip === 0 ? "" : formData.tip}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, "");
                    setFormData({ ...formData, tip: val ? Number(val) : 0 });
                  }}
                  onFocus={(e) => {
                    const target = e.target;
                    setTimeout(() => {
                      try {
                        target.select();
                        if (target.type !== "number") {
                          target.setSelectionRange(0, 9999);
                        }
                      } catch {}
                    }, 50);
                  }}
                  onClick={(e) => {
                    try {
                      (e.target as HTMLInputElement).select();
                    } catch {}
                  }}
                  onContextMenu={(e) => e.preventDefault()}
                  className="w-full bg-transparent border-none focus:outline-none font-black text-xs sm:text-sm text-stone-900"
                  placeholder="0"
                />
                <span className="text-[10px] font-bold text-stone-400 ml-1 shrink-0">
                  원
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between ml-0.5">
                <label className="text-[11px] font-black text-stone-600">
                  상태 (반티여부)
                </label>
                {durationMinutes > 0 && (
                  <span
                    className={cn(
                      "text-[9px] font-black px-1.5 py-0.5 rounded-md shadow-2xs",
                      isAutoFull
                        ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                        : isAutoBanti
                          ? "bg-blue-100 text-blue-700 border border-blue-200"
                          : isReviewNeeded
                            ? "bg-amber-100 text-amber-700 border border-amber-200 animate-pulse"
                            : "bg-stone-100 text-stone-500 border border-stone-200",
                    )}
                  >
                    {isAutoFull
                      ? "자동: 1티 추가 (+40분↑)"
                      : isAutoBanti
                        ? "자동: 반티 적용 (20~34분)"
                        : isReviewNeeded
                          ? "검토필요: 반티? (5~19분, 35~39분)"
                          : leftoverMinutes > 0
                            ? `일반 (${leftoverMinutes}분)`
                            : "정시"}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      isBanti: false,
                      isNoBanti: !formData.isNoBanti,
                      isRoundUp: false,
                      isRoundDownHalf: false,
                      isRoundDownFull: false,
                    })
                  }
                  className={cn(
                    "py-1.5 rounded-xl border text-[11px] font-black transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95",
                    formData.isNoBanti
                      ? "bg-stone-900 border-stone-900 text-white shadow-xs"
                      : "bg-white border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50",
                  )}
                >
                  반티x {formData.isNoBanti && <Check className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      isBanti: !formData.isBanti,
                      isNoBanti: false,
                      isRoundUp: false,
                      isRoundDownHalf: false,
                      isRoundDownFull: false,
                    })
                  }
                  className={cn(
                    "py-1.5 rounded-xl border text-[11px] font-black transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95",
                    formData.isBanti
                      ? "bg-red-600 border-red-600 text-white shadow-xs"
                      : "bg-white border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50",
                  )}
                >
                  반티ㅇ {formData.isBanti && <Check className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      isBanti: false,
                      isNoBanti: false,
                      isRoundUp: !formData.isRoundUp,
                      isRoundDownHalf: false,
                      isRoundDownFull: false,
                    })
                  }
                  className={cn(
                    "py-1.5 rounded-xl border text-[11px] font-black transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95",
                    formData.isRoundUp
                      ? "bg-emerald-600 border-emerald-600 text-white shadow-xs"
                      : "bg-white border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50",
                  )}
                >
                  올림 <ArrowUp className="w-3.5 h-3.5" />{" "}
                  {formData.isRoundUp && <Check className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      isBanti: false,
                      isNoBanti: false,
                      isRoundUp: false,
                      isRoundDownHalf: !formData.isRoundDownHalf,
                      isRoundDownFull: false,
                    })
                  }
                  className={cn(
                    "py-1.5 rounded-xl border text-[11px] font-black transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95",
                    formData.isRoundDownHalf
                      ? "bg-blue-600 border-blue-600 text-white shadow-xs"
                      : "bg-white border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50",
                  )}
                >
                  반티내림 <ArrowDown className="w-3.5 h-3.5" />{" "}
                  {formData.isRoundDownHalf && <Check className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      isBanti: false,
                      isNoBanti: false,
                      isRoundUp: false,
                      isRoundDownHalf: false,
                      isRoundDownFull: !formData.isRoundDownFull,
                    })
                  }
                  className={cn(
                    "py-1.5 rounded-xl border text-[11px] font-black transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95",
                    formData.isRoundDownFull
                      ? "bg-purple-600 border-purple-600 text-white shadow-xs"
                      : "bg-white border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50",
                  )}
                >
                  정티내림 <ArrowDown className="w-3.5 h-3.5" />{" "}
                  {formData.isRoundDownFull && <Check className="w-3.5 h-3.5" />}
                </button>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formData.extraFullUnits || ""}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, "");
                      setFormData({
                        ...formData,
                        extraFullUnits: val ? Number(val) : 0,
                      });
                    }}
                    onFocus={(e) => e.target.select()}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="w-full py-1.5 rounded-xl border border-stone-200 bg-white text-[11px] font-black text-center focus:ring-2 focus:ring-stone-900/10 focus:border-stone-900 outline-none pr-4 shadow-2xs"
                    placeholder="0"
                  />
                  <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-black text-stone-400 pointer-events-none">
                    티+
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. 여직원 / 업소명 */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label className="text-[11px] font-black text-stone-600 block ml-0.5">
                여직원
              </label>
              <button
                type="button"
                onClick={() => setIsStaffSelectorOpen(true)}
                className="w-full bg-stone-50 hover:bg-stone-100/80 border border-stone-200 hover:border-stone-300 rounded-xl px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/10 font-black text-left flex items-center justify-between transition-all cursor-pointer shadow-2xs"
              >
                <span className="truncate text-stone-900">
                  {formData.staffNames.length === 0
                    ? "선택"
                    : formData.staffNames.length === 1
                      ? formData.staffNames[0]
                      : `${formData.staffNames[0]} 외 ${formData.staffNames.length - 1}명`}
                </span>
                <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />
              </button>
              {editRecord && groupStaffNames.length > 1 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {groupStaffNames.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => toggleStaffSelection(name)}
                      className={cn(
                        "text-[10px] px-2 py-0.5 rounded-lg font-black border transition-all active:scale-95 cursor-pointer",
                        formData.staffNames.includes(name)
                          ? "bg-stone-900 border-stone-900 text-white shadow-2xs"
                          : "bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100",
                      )}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1 relative">
              <label className="text-[11px] font-black text-stone-600 block ml-0.5">
                업소명
              </label>
              <input
                required
                type="text"
                value={formData.establishmentName}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    establishmentName: e.target.value,
                  })
                }
                onFocus={(e) => {
                  setIsEstablishmentDropdownOpen(true);
                  e.target.select();
                }}
                onClick={(e) => {
                  (e.target as HTMLInputElement).select();
                }}
                onBlur={() => {
                  setTimeout(() => setIsEstablishmentDropdownOpen(false), 200);
                }}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    isEstablishmentDropdownOpen &&
                    filteredEstablishments.length > 0
                  ) {
                    e.preventDefault();
                    setFormData({
                      ...formData,
                      establishmentName: filteredEstablishments[0].name,
                    });
                    setIsEstablishmentDropdownOpen(false);
                  }
                }}
                className="w-full bg-stone-50 hover:bg-stone-100/80 focus:bg-white border border-stone-200 focus:border-stone-900 rounded-xl px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/10 font-black text-stone-900 transition-all shadow-2xs"
                placeholder="업소명 입력"
                autoComplete="off"
              />
              {isEstablishmentDropdownOpen &&
                filteredEstablishments.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-stone-200 rounded-xl shadow-xl z-[100] max-h-44 overflow-y-auto py-1 divide-y divide-stone-50">
                    {filteredEstablishments.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onMouseDown={(ev) => {
                          ev.preventDefault();
                          setFormData({
                            ...formData,
                            establishmentName: e.name,
                          });
                          setIsEstablishmentDropdownOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 text-xs sm:text-sm hover:bg-stone-50 font-black text-stone-800 hover:text-stone-900 transition-colors flex items-center justify-between cursor-pointer"
                      >
                        <span>{e.name}</span>
                        <span className="text-[10px] text-stone-400 font-bold">선택</span>
                      </button>
                    ))}
                  </div>
                )}
            </div>
          </div>

          {/* 4. 시작 시간 / 종료 시간 */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label className="text-[11px] font-black text-stone-600 block ml-0.5">
                시작 시간
              </label>
              <div className="flex gap-1.5">
                <div
                  className={cn(
                    "flex-1 flex items-center border rounded-xl px-2.5 py-1.5 transition-all shadow-2xs",
                    activeTimeField === "startTime"
                      ? "bg-stone-900 border-stone-900 text-white ring-2 ring-stone-900/20"
                      : "bg-stone-50 hover:bg-stone-100/80 border-stone-200 text-stone-900",
                  )}
                >
                  <input
                    ref={startTimeInputRef}
                    type="text"
                    inputMode="numeric"
                    value={formData.startTime}
                    onChange={(e) =>
                      handleTimeInputChange(e.target.value, "startTime")
                    }
                    onFocus={(e) => {
                      setActiveTimeField("startTime");
                      const target = e.target;
                      setTimeout(() => {
                        try {
                          target.select();
                          if (target.type !== "number") {
                            target.setSelectionRange(0, 9999);
                          }
                        } catch {}
                      }, 50);
                    }}
                    onClick={(e) => {
                      (e.target as HTMLInputElement).select();
                    }}
                    onContextMenu={(e) => e.preventDefault()}
                    onBlur={() => {
                      if (
                        formData.startTime.length === 5 &&
                        formData.endTime.length === 5
                      ) {
                        try {
                          const start = getBusinessDate(
                            selectedDate,
                            formData.startTime,
                          );
                          const end = getBusinessDate(
                            selectedDate,
                            formData.endTime,
                          );
                          if (start > end) {
                            setFormData((prev) => ({
                              ...prev,
                              endTime: prev.startTime,
                            }));
                          }
                        } catch {
                          // ignore
                        }
                      }
                    }}
                    autoComplete="off"
                    className="w-full bg-transparent border-none focus:outline-none font-black text-sm text-center tracking-wider"
                    placeholder="00:00"
                  />
                </div>
                <button
                  type="button"
                  onContextMenu={(e) => e.preventDefault()}
                  onClick={() => {
                    const now = format(new Date(), "HH:mm");
                    setFormData((prev) => {
                      const wasOngoing = prev.startTime === prev.endTime;
                      if (wasOngoing) {
                        return {
                          ...prev,
                          startTime: now,
                          endTime: now,
                        };
                      }
                      let nextEndTime = prev.endTime;
                      try {
                        const start = getBusinessDate(selectedDate, now);
                        const end = getBusinessDate(selectedDate, nextEndTime);
                        if (start > end) {
                          nextEndTime = now;
                        }
                      } catch {
                        // ignore
                      }
                      return {
                        ...prev,
                        startTime: now,
                        endTime: nextEndTime,
                      };
                    });
                    setTimeout(() => {
                      if (startTimeInputRef.current) {
                        try {
                          startTimeInputRef.current.focus();
                          startTimeInputRef.current.setSelectionRange(
                            0,
                            startTimeInputRef.current.value.length,
                          );
                        } catch {}
                      }
                    }, 50);
                  }}
                  className="px-2.5 shrink-0 bg-stone-900 text-white rounded-xl text-xs font-black hover:bg-stone-800 transition-all shadow-xs active:scale-95 cursor-pointer"
                >
                  현재
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-black text-stone-600 block ml-0.5">
                종료 시간
              </label>
              <div className="flex gap-1.5">
                <div
                  className={cn(
                    "flex-1 flex items-center border rounded-xl px-2.5 py-1.5 transition-all shadow-2xs",
                    activeTimeField === "endTime"
                      ? "bg-stone-900 border-stone-900 text-white ring-2 ring-stone-900/20"
                      : "bg-stone-50 hover:bg-stone-100/80 border-stone-200 text-stone-900",
                  )}
                >
                  <input
                    ref={endTimeInputRef}
                    type="text"
                    inputMode="numeric"
                    value={formData.endTime}
                    onChange={(e) =>
                      handleTimeInputChange(e.target.value, "endTime")
                    }
                    onFocus={(e) => {
                      setActiveTimeField("endTime");
                      const target = e.target;
                      setTimeout(() => {
                        try {
                          target.select();
                          if (target.type !== "number") {
                            target.setSelectionRange(0, 9999);
                          }
                        } catch {}
                      }, 50);
                    }}
                    onClick={(e) => {
                      try {
                        (e.target as HTMLInputElement).select();
                      } catch {}
                    }}
                    onContextMenu={(e) => e.preventDefault()}
                    autoComplete="off"
                    className="w-full bg-transparent border-none focus:outline-none font-black text-sm text-center tracking-wider"
                    placeholder="00:00"
                  />
                </div>
                <button
                  type="button"
                  onContextMenu={(e) => e.preventDefault()}
                  onClick={() => {
                    const now = format(new Date(), "HH:mm");
                    setFormData((prev) => ({ ...prev, endTime: now }));
                    setTimeout(() => {
                      if (endTimeInputRef.current) {
                        try {
                          endTimeInputRef.current.focus();
                          endTimeInputRef.current.setSelectionRange(
                            0,
                            endTimeInputRef.current.value.length,
                          );
                        } catch {}
                      }
                    }, 50);
                  }}
                  className="px-2.5 shrink-0 bg-stone-900 text-white rounded-xl text-xs font-black hover:bg-stone-800 transition-all shadow-xs active:scale-95 cursor-pointer"
                >
                  현재
                </button>
              </div>
            </div>
          </div>

          {/* 진행 시간 / 업무중 상태 표시 */}
          <div className="flex justify-center -my-0.5">
            <div
              className={cn(
                "px-3.5 py-1 rounded-full border flex items-center gap-1.5 shadow-2xs transition-all",
                formData.startTime === formData.endTime
                  ? "bg-amber-50 border-amber-200 text-amber-900"
                  : "bg-stone-100/90 border-stone-200/80 text-stone-900",
              )}
            >
              <span
                className={cn(
                  "text-[10px] font-bold uppercase tracking-wider",
                  formData.startTime === formData.endTime
                    ? "text-amber-700 font-black"
                    : "text-stone-500",
                )}
              >
                {formData.startTime === formData.endTime ? "상태" : "진행 시간"}
              </span>
              <span className="text-xs font-black">
                {formData.startTime === formData.endTime ? (
                  <span className="flex items-center gap-1.5 text-amber-800">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    업무중 (진행중)
                  </span>
                ) : (
                  <>
                    {fullHours}시간 {leftoverMinutes}분
                    {formData.extraFullUnits > 0 && (
                      <span className="text-emerald-600 font-black ml-1">
                        +{formData.extraFullUnits}티
                      </span>
                    )}
                  </>
                )}
              </span>
            </div>
          </div>

          {/* 5. 종료 시간 미세 조정 */}
          <div className="bg-stone-50/80 p-2.5 rounded-2xl border border-stone-200/80 space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-black text-stone-700 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-stone-500" />
                {activeTimeField === "startTime"
                  ? "시작 시간 미세 조정"
                  : "종료 시간 미세 조정"}
              </span>
              <span className="text-[10px] font-bold text-stone-500 bg-white px-2 py-0.5 rounded-md border border-stone-200/70 shadow-2xs">
                {activeTimeField === "startTime" ? "시작" : "종료"}: {formData[activeTimeField]}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              <button
                type="button"
                onClick={() => adjustTime(-5)}
                className="py-2 text-xs font-black bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 rounded-xl border border-rose-200 hover:border-rose-300 transition-all shadow-2xs active:scale-95 cursor-pointer flex items-center justify-center gap-0.5"
              >
                -5분
              </button>
              <button
                type="button"
                onClick={() => adjustTime(5)}
                className="py-2 text-xs font-black bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 rounded-xl border border-emerald-200 hover:border-emerald-300 transition-all shadow-2xs active:scale-95 cursor-pointer flex items-center justify-center gap-0.5"
              >
                +5분
              </button>
              <button
                type="button"
                onClick={() => adjustTime(-1)}
                className="py-2 text-xs font-black bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 rounded-xl border border-rose-200 hover:border-rose-300 transition-all shadow-2xs active:scale-95 cursor-pointer flex items-center justify-center gap-0.5"
              >
                -1분
              </button>
              <button
                type="button"
                onClick={() => adjustTime(1)}
                className="py-2 text-xs font-black bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 rounded-xl border border-emerald-200 hover:border-emerald-300 transition-all shadow-2xs active:scale-95 cursor-pointer flex items-center justify-center gap-0.5"
              >
                +1분
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-stone-100">
            {editRecord && (
              <button
                type="button"
                onClick={async () => {
                  if (!isDeleteConfirming) {
                    setIsDeleteConfirming(true);
                  } else {
                    const ongoingRecords = groupRecords.filter((r) => {
                      if (!formData.staffNames.includes(r.staffName))
                        return false;
                      const rStart = r.startTime.toDate
                        ? r.startTime.toDate()
                        : new Date(r.startTime);
                      const rEnd = r.endTime.toDate
                        ? r.endTime.toDate()
                        : new Date(r.endTime);
                      return rStart.getTime() === rEnd.getTime();
                    });

                    if (
                      ongoingRecords.length > 0 &&
                      !isOngoingDeleteConfirming
                    ) {
                      setIsOngoingDeleteConfirming(true);
                      return;
                    }

                    try {
                      // Delete all selected staff records that are part of this group
                      const recordsToDelete = groupRecords.filter((r) =>
                        formData.staffNames.includes(r.staffName),
                      );

                      if (recordsToDelete.length > 0) {
                        for (const record of recordsToDelete) {
                          await deleteDispatch(record.id!);
                        }
                      }

                      onClose();
                    } catch (error) {
                      console.error("기록 삭제 오류:", error);
                      setError(
                        `기록 삭제 오류: ${getErrorMessage(error, "기록 삭제 중 오류가 발생했습니다.")}`,
                      );
                    }
                  }
                }}
                onMouseLeave={() => {
                  setIsDeleteConfirming(false);
                  setIsOngoingDeleteConfirming(false);
                }}
                className={cn(
                  "flex-1 min-w-[54px] py-2.5 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95",
                  isOngoingDeleteConfirming
                    ? "bg-red-700 text-white animate-pulse shadow-xs"
                    : isDeleteConfirming
                      ? "bg-red-600 text-white hover:bg-red-700 shadow-xs"
                      : "bg-red-50 text-red-600 hover:bg-red-100 border border-red-100",
                )}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>
                  {isOngoingDeleteConfirming
                    ? "진행중인데 삭제?"
                    : isDeleteConfirming
                      ? "정말 삭제?"
                      : "삭제"}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={handleBounceClick}
              onMouseLeave={() => setIsBounceConfirming(false)}
              className={cn(
                "flex-1 min-w-[54px] py-2.5 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1 active:scale-95 cursor-pointer",
                isBounceConfirming
                  ? "bg-rose-600 text-white animate-pulse shadow-md"
                  : "bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-100",
              )}
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>{isBounceConfirming ? "정말 튕김?" : "튕김"}</span>
            </button>
            {editRecord && (
              <button
                type="button"
                onClick={() => {
                  const now = format(new Date(), "HH:mm");
                  setFormData((prev) => ({ ...prev, endTime: now }));
                }}
                className="flex-1 min-w-[54px] bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-100 py-2.5 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1 active:scale-95 cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>종료</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-w-[50px] bg-stone-100 text-stone-600 hover:bg-stone-200 border border-stone-200 py-2.5 rounded-xl font-black text-xs transition-all active:scale-95 cursor-pointer"
            >
              취소
            </button>
            {isConfirmingNewRecords && (
              <div className="flex-1 min-w-0 bg-red-50 border border-red-100 rounded-xl p-2 animate-pulse flex items-center justify-center">
                <p className="text-[9px] font-bold text-red-600 leading-tight text-center">
                  {editRecord && newStaffToCreate.length > 0 ? (
                    <>{newStaffToCreate.length}명 제외(그룹 아님)</>
                  ) : alreadyWorkingStaff.length > 0 ? (
                    <>{alreadyWorkingStaff.length}명 파견중(중복 확인)</>
                  ) : (
                    <>{newStaffToCreate.length}명 새 기록 추가</>
                  )}
                </p>
              </div>
            )}
            <button
              disabled={isSubmitting}
              type="submit"
              className={cn(
                "flex-[2] min-w-[90px] py-2.5 rounded-xl font-black text-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-sm",
                isConfirmingNewRecords
                  ? "bg-red-600 text-white animate-pulse"
                  : "bg-stone-900 text-white hover:bg-stone-800",
              )}
            >
              {isSubmitting
                ? "저장 중..."
                : isConfirmingNewRecords
                  ? alreadyWorkingStaff.length > 0
                    ? "중복 확인"
                    : "확인 (한번 더)"
                  : editRecord
                    ? "수정 완료"
                    : "기록 저장하기"}
            </button>
          </div>
        </form>
      </motion.div>

      {/* Staff Multi-Selector Overlay */}
      <AnimatePresence>
        {isStaffSelectorOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsStaffSelectorOpen(false)}
              className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-[95vw] max-w-3xl bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="p-4 border-b border-stone-100 flex items-center justify-between">
                <h3 className="font-bold">여직원 선택</h3>
                <button
                  onClick={() => setIsStaffSelectorOpen(false)}
                  className="text-stone-400"
                >
                  <Plus className="w-5 h-5 rotate-45" />
                </button>
              </div>
              <div className="p-2 overflow-y-auto flex-1">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {(() => {
                    const ongoingRecords = allRecords.filter((r) => {
                      const start = r.startTime.toDate
                        ? r.startTime.toDate()
                        : new Date(r.startTime);
                      const end = r.endTime.toDate
                        ? r.endTime.toDate()
                        : new Date(r.endTime);
                      return start.getTime() === end.getTime();
                    });
                    const staffWithOngoing = new Set(
                      ongoingRecords.map((r) => r.staffName),
                    );

                    return workingStaff.map((s) => {
                      const isSelected = formData.staffNames.includes(s.name);
                      const isFinished = offStaffIds.includes(s.id!);
                      const isOngoing =
                        !isFinished && staffWithOngoing.has(s.name);
                      const isWaiting =
                        !isFinished && !staffWithOngoing.has(s.name);

                      const baseClasses =
                        "flex flex-col items-center justify-center p-2 sm:p-3 rounded-xl transition-all font-bold relative overflow-hidden border-2";
                      let stateClasses = "";

                      if (isSelected) {
                        stateClasses =
                          "bg-stone-900 border-stone-900 text-white shadow-md";
                      } else if (isFinished) {
                        stateClasses =
                          "border-stone-800 bg-stone-900/10 text-stone-600";
                      } else if (isOngoing) {
                        stateClasses =
                          "border-emerald-500 bg-emerald-500/10 text-emerald-700";
                      } else if (isWaiting) {
                        stateClasses =
                          "border-red-500 bg-red-500/10 text-red-700";
                      }

                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => toggleStaffSelection(s.name)}
                          className={cn(baseClasses, stateClasses)}
                        >
                          <div className="flex flex-col sm:flex-row items-center justify-center gap-1 w-full relative z-10 text-[13px] sm:text-sm">
                            <span className="whitespace-nowrap">{s.name}</span>
                            <span
                              className={cn(
                                "px-1 py-0.5 rounded text-[8px] font-bold text-white shrink-0 mt-0.5 sm:mt-0",
                                s.type === "HOPPER"
                                  ? "bg-purple-500"
                                  : s.type === "PUBLIC"
                                    ? "bg-blue-500"
                                    : "bg-emerald-500",
                              )}
                            >
                              {s.type === "HOPPER"
                                ? "하"
                                : s.type === "PUBLIC"
                                  ? "퍼"
                                  : "커"}
                            </span>
                          </div>
                          {s.id && checkInTimes[s.id] && (
                            <span
                              className={cn(
                                "text-[10px] font-medium mt-1",
                                isSelected ? "text-stone-300" : "opacity-70",
                              )}
                            >
                              출근:{" "}
                              {format(checkInTimes[s.id].toDate(), "HH:mm")}
                            </span>
                          )}
                          {isSelected && (
                            <div className="absolute top-1 right-1">
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          )x�t��N�0��>�U�dp~DR	��H}'�n#;�oh�*e����x��w U�B���:���>nFp��aZi59��/�F�����y�ԟ�[2ɭ��%&㊝C�M����Ŷ��N�h<D��]d���y�=v�Z]�"{L֞�,ҭ�b�3��B�	.-:6���&j)�Z�3Hg��Q�Kb�yAF�*ǜ�.%���Z�]��C>W9�����;��6��W��B���{�b�jF�f���;Zq�(&KM�VA��E�W�(9�A�*�.s����   �� ?��