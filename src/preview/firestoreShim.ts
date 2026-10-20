/**
 * 속도/기능 미리보기 전용 Firestore 값 shim.
 *
 * 미리보기 번들에 Firebase SDK와 프로젝트 설정을 전혀 넣지 않으면서,
 * 화면 코드가 사용하는 Timestamp/deleteField 형태만 제공한다.
 */
export class Timestamp {
  readonly seconds: number;
  readonly nanoseconds: number;

  constructor(seconds: number, nanoseconds: number) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }

  static now() {
    return Timestamp.fromMillis(Date.now());
  }

  static fromDate(date: Date) {
    return Timestamp.fromMillis(date.getTime());
  }

  static fromMillis(milliseconds: number) {
    const seconds = Math.floor(milliseconds / 1000);
    const nanoseconds = Math.floor((milliseconds - seconds * 1000) * 1_000_000);
    return new Timestamp(seconds, nanoseconds);
  }

  toDate() {
    return new Date(this.toMillis());
  }

  toMillis() {
    return this.seconds * 1000 + this.nanoseconds / 1_000_000;
  }

  isEqual(other: Timestamp) {
    return (
      this.seconds === other.seconds &&
      this.nanoseconds === other.nanoseconds
    );
  }

  valueOf() {
    return this.toMillis();
  }

  toJSON() {
    return {
      seconds: this.seconds,
      nanoseconds: this.nanoseconds,
      type: "firestore/timestamp/1.0",
    };
  }
}

export function deleteField() {
  return { _methodName: "deleteField" };
}
