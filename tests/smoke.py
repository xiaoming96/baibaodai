"""Real browser regression. Requires Python Playwright + Chromium and running Vite."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

OUTPUT = Path('/tmp/pocket-smoke')
OUTPUT.mkdir(exist_ok=True)
BASE_URL = os.environ.get('POCKET_TEST_URL', 'http://127.0.0.1:5173')

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
    page.set_default_timeout(7000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE_URL, wait_until='networkidle')
    expect(page.locator('h1')).to_contain_text('今天的烦恼')
    if page.get_by_role('button', name='好啦，去掏口袋').is_visible():
        page.get_by_role('button', name='好啦，去掏口袋').click()
    page.screenshot(path=str(OUTPUT / 'desktop.png'), full_page=True)
    page.get_by_role('button', name='帮我找找', exact=True).click()
    expect(page.get_by_role('status')).to_contain_text('先把你的小烦恼')
    page.locator('#worry').fill('明天要汇报，有点紧张')
    page.get_by_role('button', name='帮我找找', exact=True).click()
    expect(page.locator('.modal-card h2')).to_have_text('勇气补丁')
    page.locator('#strength').fill('100')
    page.evaluate('Math.random = () => 0.85')
    page.get_by_role('button', name='启动道具', exact=True).click()
    expect(page.locator('.outcome-card')).to_have_class('outcome-card chaos')
    expect(page.locator('.outcome-card')).to_contain_text('巡回演唱会')
    page.get_by_role('button', name='做成明信片', exact=True).click()
    page.locator('.template-options button').filter(has_text='玩梗向').click()
    page.locator('#poster-caption').fill('今天也要保留一点孩子气。')
    with page.expect_download() as download_info:
        page.locator('.poster-primary').click()
    download_info.value.save_as(str(OUTPUT / 'postcard.png'))
    # The PNG signature and IHDR confirm an actual high-resolution image was exported.
    png = (OUTPUT / 'postcard.png').read_bytes()
    assert png[:8] == b'\x89PNG\r\n\x1a\n'
    assert int.from_bytes(png[16:20], 'big') == 860
    assert int.from_bytes(png[20:24], 'big') == 1200
    page.locator('.poster-secondary').click()
    expect(page.locator('.poster-message')).to_contain_text('先保存海报')
    page.get_by_role('button', name='关闭海报窗口').click()
    expect(page.get_by_role('button', name='做成明信片', exact=True)).to_be_focused()
    page.get_by_role('button', name='关闭', exact=True).click()
    page.locator('.fortune-pill').click()
    expect(page.locator('.fortune-content')).to_be_visible()
    daily_name = page.locator('.modal-card h2').inner_text()
    page.get_by_role('button', name='收下今天的好运').click()
    page.locator('.fortune-pill').click()
    expect(page.locator('.modal-card h2')).to_have_text(daily_name)
    page.get_by_role('button', name='关闭', exact=True).click()
    page.reload(wait_until='networkidle')
    page.get_by_role('button', name='道具图鉴', exact=True).click()
    assert page.locator('.atlas-card:not(.locked)').count() == 2
    page.get_by_role('tab', name='乌龙事件簿').click()
    expect(page.locator('.event-card')).to_contain_text('巡回演唱会')
    page.get_by_role('button', name='合体实验室', exact=True).click()
    page.locator('.fusion-selection button').nth(0).click()
    page.locator('.fusion-selection button').nth(1).click()
    page.evaluate('Math.random = () => 0.5')
    page.get_by_role('button', name='开始合体', exact=True).click()
    expect(page.locator('.gadget-kicker')).to_have_text('叮！实验成功啦')
    page.get_by_role('button', name='关闭', exact=True).click()
    expect(page.get_by_role('button', name='开始合体', exact=True)).to_be_disabled()
    page.get_by_role('button', name='道具图鉴', exact=True).click()
    page.get_by_role('tab', name='道具图鉴', exact=True).click()
    expect(page.locator('.atlas-card:not(.locked)')).to_have_count(3)
    # Existing collection activation consumes the same daily help quota.
    page.locator('.atlas-card:not(.locked)').first.click()
    page.get_by_role('button', name='启动道具', exact=True).click()
    expect(page.locator('.outcome-card')).to_be_visible()
    page.get_by_role('button', name='关闭', exact=True).click()
    page.locator('.atlas-card:not(.locked)').first.click()
    page.get_by_role('button', name='启动道具', exact=True).click()
    expect(page.locator('.outcome-card')).to_be_visible()
    page.get_by_role('button', name='关闭', exact=True).click()
    page.get_by_role('button', name='烦恼求助', exact=True).click()
    expect(page.get_by_role('button', name='帮我找找', exact=True)).to_be_disabled()
    saved = json.loads(page.evaluate("localStorage.getItem('wonder-pocket:v1')"))
    assert saved['usage']['help'] == 3 and saved['usage']['blind'] == 1 and saved['usage']['fusion'] == 1
    assert saved['stats']['fusions'] == 1
    assert not errors, errors
    print('PASS desktop: complete gameplay, quotas, persistence, fusion, 860x1200 PNG, share fallback')
    for width in [320, 375, 768]:
        context = browser.new_context(viewport={'width': width, 'height': 850}, is_mobile=width < 600, has_touch=width < 600)
        mobile = context.new_page()
        mobile.on('pageerror', lambda error: errors.append(str(error)))
        mobile.goto(BASE_URL, wait_until='networkidle')
        if mobile.get_by_role('button', name='好啦，去掏口袋').is_visible():
            mobile.get_by_role('button', name='好啦，去掏口袋').click()
        assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'overflow at {width}'
        mobile.screenshot(path=str(OUTPUT / f'mobile-{width}.png'), full_page=True)
        mobile.get_by_role('button', name='关于事务所').click()
        expect(mobile.locator('.guide-steps')).to_be_visible()
        mobile.get_by_role('button', name='好啦，去掏口袋').click()
        mobile.locator('#worry').fill('明天汇报紧张')
        mobile.get_by_role('button', name='帮我找找', exact=True).click()
        expect(mobile.locator('.modal-card h2')).to_have_text('勇气补丁')
        mobile.get_by_role('button', name='启动道具', exact=True).click()
        expect(mobile.locator('.outcome-card')).to_be_visible()
        mobile.get_by_role('button', name='做成明信片', exact=True).click()
        expect(mobile.locator('.poster-primary')).to_be_visible()
        assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'poster overflow at {width}'
        context.close()
        print(f'PASS responsive {width}px: no overflow, guide, gameplay and poster')
    assert not errors, errors
    if os.environ.get('POCKET_TEST_OFFLINE') == '1':
        offline_context = browser.new_context()
        offline_page = offline_context.new_page()
        offline_page.goto(BASE_URL, wait_until='networkidle')
        if offline_page.get_by_role('button', name='好啦，去掏口袋').is_visible():
            offline_page.get_by_role('button', name='好啦，去掏口袋').click()
        offline_page.evaluate('navigator.serviceWorker.ready.then(() => true)')
        offline_page.wait_for_function('navigator.serviceWorker.controller !== null')
        offline_context.set_offline(True)
        offline_page.reload(wait_until='networkidle')
        expect(offline_page.locator('h1')).to_contain_text('今天的烦恼')
        offline_page.locator('#worry').fill('睡不着，失眠了')
        offline_page.get_by_role('button', name='帮我找找', exact=True).click()
        expect(offline_page.locator('.modal-card h2')).to_have_text('晚安收音机')
        offline_context.close()
        print('PASS offline: cached production page reload and gadget matching')
    browser.close()
