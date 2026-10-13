"""New static features regression, with no real service credentials or payments."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

URL = os.environ.get('POCKET_TEST_URL', 'http://127.0.0.1:5173')
OUT = Path('/tmp/pocket-features-smoke')
OUT.mkdir(exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
    page.set_default_timeout(7000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(URL, wait_until='networkidle')
    if page.get_by_role('button', name='好啦，去掏口袋').is_visible():
        page.get_by_role('button', name='好啦，去掏口袋').click()
    page.locator('#worry').fill('明天汇报紧张')
    page.get_by_role('button', name='帮我找找', exact=True).click()
    expect(page.locator('.modal-card h2')).to_have_text('勇气补丁')
    page.evaluate('Math.random = () => 0.5')
    page.get_by_role('button', name='启动道具', exact=True).click()
    expect(page.locator('.outcome-card')).to_be_visible()
    page.get_by_role('button', name='展开完整故事').click()
    expect(page.locator('.outcome-story span[aria-hidden="true"]').first).to_contain_text('大家都认真听了')
    page.get_by_role('button', name='关闭', exact=True).click()
    page.get_by_role('button', name='道具图鉴', exact=True).click()
    page.get_by_role('button', name='心选勇气补丁', exact=True).click()
    page.get_by_role('button', name='只看心选 1').click()
    expect(page.locator('.atlas-card')).to_have_count(1)
    page.get_by_role('tab', name='最近奇遇').click()
    expect(page.locator('.history-card')).to_have_count(1)
    page.locator('.history-card').click()
    expect(page.get_by_role('button', name='展开完整故事')).to_have_count(0)
    page.get_by_role('button', name='关闭', exact=True).click()
    page.get_by_role('button', name='我的口袋账户').click()
    expect(page.get_by_role('button', name='手机号登录暂未开放')).to_be_disabled()
    expect(page.get_by_role('button', name='微信登录暂未开放')).to_be_disabled()
    with page.expect_download() as download:
        page.get_by_role('button', name='导出收藏', exact=True).click()
    download.value.save_as(str(OUT / 'backup.json'))
    backup = json.loads((OUT / 'backup.json').read_text())
    assert 'courage-badge' in backup['favorites']
    assert len(backup['history']) == 1
    assert not any(key in backup for key in ['token', 'user', 'memberUntil', 'orders'])
    before = page.evaluate("localStorage.getItem('wonder-pocket:v1')")
    page.locator('input[type=file]').set_input_files({'name': 'bad.json', 'mimeType': 'application/json', 'buffer': b'not json'})
    expect(page.locator('.toast-message')).to_be_visible()
    assert page.evaluate("localStorage.getItem('wonder-pocket:v1')") == before
    page.locator('.brand').click()
    page.locator('.club-links button').nth(1).click()
    page.locator('input[maxlength="24"]').fill('会打盹的云朵帽')
    page.locator('textarea').nth(0).fill('让脑袋先休息一下，再认真想事情。')
    page.locator('textarea').nth(1).fill('帽子偶尔会替你打呼噜。')
    page.get_by_role('button', name='先保存这份草稿').click()
    page.reload(wait_until='networkidle')
    page.locator('.club-links button').nth(1).click()
    expect(page.locator('input[maxlength="24"]')).to_have_value('会打盹的云朵帽')
    page.locator('.brand').click()
    page.locator('.club-links button').nth(0).click()
    expect(page.get_by_role('button', name='小物柜台即将开张')).to_be_disabled()
    assert page.locator('.seasonal-card').count() == 3
    page.get_by_role('button', name='口袋月卡', exact=True).click()
    expect(page.locator('.member-price')).to_contain_text('9.9')
    expect(page.locator('.membership-details .primary-button')).to_be_disabled()
    page.get_by_role('button', name='我的订单', exact=True).click()
    expect(page.get_by_role('button', name='登录查看我的订单')).to_be_visible()
    # Import into a separate empty browser must restore memories without account credentials.
    restored = browser.new_page()
    restored.goto(URL, wait_until='networkidle')
    if restored.get_by_role('button', name='好啦，去掏口袋').is_visible():
        restored.get_by_role('button', name='好啦，去掏口袋').click()
    restored.get_by_role('button', name='我的口袋账户').click()
    restored.locator('input[type=file]').set_input_files(str(OUT / 'backup.json'))
    expect(restored.locator('.toast-message')).to_contain_text('备份已合并')
    restored.get_by_role('button', name='道具图鉴', exact=True).click()
    expect(restored.get_by_role('button', name='取消心选勇气补丁', exact=True)).to_have_attribute('aria-pressed', 'true')
    print('PASS favorites, complete history, backup roundtrip, corrupt import safety, drafts, gated commercial features')
    for width in [320, 375, 768]:
        mobile = browser.new_page(viewport={'width': width, 'height': 850})
        mobile.goto(URL, wait_until='networkidle')
        if mobile.get_by_role('button', name='好啦，去掏口袋').is_visible():
            mobile.get_by_role('button', name='好啦，去掏口袋').click()
        for entry in [0, 1, 2]:
            mobile.locator('.brand').click()
            mobile.locator('.club-links button').nth(entry).click()
            assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width, entry)
            mobile.screenshot(path=str(OUT / f'feature-{entry}-{width}.png'), full_page=True)
        mobile.close()
        print(f'PASS account, shop and community responsive {width}px')
    assert not errors, errors
    browser.close()
