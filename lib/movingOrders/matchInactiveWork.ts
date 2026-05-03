/** הערת התאמה כש־work availability אינו «פעיל» — מוביל כזה לא מוצג בטאב התאמה כאפשרות שליחה */
export const MATCH_ISSUE_MOVER_NOT_ACTIVE_FOR_WORK = "זמינות (לא פעיל)";

/** true אם יש לפחות הערה שמציינת שהמוביל לא פעיל מבחינת זמינות לעבודה */
export function moverExcludedAsInactiveForWork(issues: string[] | undefined): boolean {
  if (!issues?.length) return false;
  return issues.some((x) => x.includes(MATCH_ISSUE_MOVER_NOT_ACTIVE_FOR_WORK));
}
