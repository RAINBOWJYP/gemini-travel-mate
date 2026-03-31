/**
 * Metro/Expo 터미널에서 에러를 확인할 수 있도록 로그합니다.
 * (앱 화면의 에러 문구와 동일한 메시지를 복사 없이 터미널에서 볼 수 있게 함)
 */
export const logUserFacingError = (
  scope: string,
  userMessage: string,
  cause?: unknown
): void => {
  const prefix = `[중한통역][${scope}]`;
  console.error(`${prefix} ${userMessage}`);
  if (cause !== undefined) {
    console.error(`${prefix} 상세:`, cause);
  }
};
