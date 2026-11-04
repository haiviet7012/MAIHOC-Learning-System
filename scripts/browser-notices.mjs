// Existing browser journeys dismiss the entry notice exactly as a visitor does.
// Wait for initial app rendering so a late module load cannot reopen it after this check.
export async function dismissDevelopmentNotice(page) {
  await page.locator('#view > :first-child').waitFor({ state: 'attached' });
  const notice = page.locator('#development-notice-dialog');
  if (await notice.isVisible()) {
    await notice.getByRole('button', { name: 'Đóng thông báo', exact: true }).click();
    await notice.waitFor({ state: 'hidden' });
  }
}
