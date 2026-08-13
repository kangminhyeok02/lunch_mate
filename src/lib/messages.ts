/** User-facing copy from spec section 24, kept in one place. */

export const MESSAGES = {
  nameRequired: "이름을 선택해주세요.",
  menuRequired: "오늘 먹고 싶은 메뉴를 선택해주세요.",
  speedRequired: "식사 속도를 선택해주세요.",
  answerRequired: "답변을 적어주세요.",
  alreadySubmitted: "오늘의 정보는 이미 제출되었습니다.",
  waitingForAssignment: "아직 점심조가 결정되지 않았어요.\n잠시만 기다려주세요!",
  serverError: "잠시 문제가 발생했어요.\n다시 시도해주세요.",
  duplicateDetail: "이미 오늘의 점심 정보를 제출했어요!\n현재 점심조 배정을 기다리고 있습니다.",
} as const;
