const PAGE_PATH = '/index.html';
let pageTabId: number | undefined;

async function focusOrOpenPage() {
  const url = browser.runtime.getURL(PAGE_PATH);

  if (pageTabId !== undefined) {
    try {
      const tab = await browser.tabs.get(pageTabId);
      if (tab.id !== undefined) {
        await browser.tabs.update(tab.id, { active: true });
        if (tab.windowId !== undefined) {
          await browser.windows.update(tab.windowId, { focused: true });
        }
        return;
      }
    } catch {
      // 标签页已被关闭，继续走新建流程
    }
  }

  const created = await browser.tabs.create({ url });
  pageTabId = created.id;
}

export default defineBackground(() => {
  browser.action.onClicked.addListener(() => {
    void focusOrOpenPage();
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    if (tabId === pageTabId) pageTabId = undefined;
  });
});
