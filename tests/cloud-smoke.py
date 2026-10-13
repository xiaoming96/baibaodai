"""Standalone browser ↔ real HTTP/SQLite regression. Requires Python Playwright and Chromium.

Run: python tests/cloud-smoke.py
Starts isolated test-only SMS fixture on 3002 and Vite on 5181, then stops both.
No live SMS, AI, payment, identity, or fulfillment provider is contacted.
"""
import json
import os
import re
import signal
import subprocess
import time
import urllib.parse
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = Path('/tmp/pocket-cloud-smoke')
OUTPUT.mkdir(exist_ok=True)
APP = 'http://127.0.0.1:5181'
API = 'http://127.0.0.1:3002'
OWNER_PHONE = '+8613900000001'
SECOND_PHONE = '+8613900000002'
ADMIN_PHONE = '+8613800000001'


def fixture(path):
    with urllib.request.urlopen(API + path, timeout=5) as response:
        return json.load(response)


def wait_ready(url, process):
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise AssertionError(f'Test service exited; inspect {OUTPUT}')
        try:
            with urllib.request.urlopen(url, timeout=1):
                return
        except Exception:
            time.sleep(0.1)
    raise AssertionError(f'Test service did not start: {url}')


def account(page):
    page.get_by_role('button', name='我的口袋账户', exact=True).click()
    expect(page.locator('.account-center')).to_be_visible()


def home(page):
    page.get_by_role('button', name='烦恼求助', exact=True).click()


def login(page, phone, check_invalid=False):
    account(page)
    expect(page.locator('#account-phone')).to_be_enabled()
    page.locator('#account-phone').fill(phone)
    with page.expect_response(lambda response: response.url.endswith('/api/auth/phone/request') and response.request.method == 'POST') as sent:
        page.get_by_role('button', name='获取验证码', exact=True).click()
    assert sent.value.ok, sent.value.status
    code = fixture('/__test/code?' + urllib.parse.urlencode({'phone': phone}))['code']
    assert code and len(code) == 6
    if check_invalid:
        page.locator('#account-code').fill('000000')
        page.get_by_role('button', name='登录，把奇妙带走', exact=True).click()
        expect(page.locator('.account-error')).to_contain_text('验证码不正确')
    page.locator('#account-code').fill(code)
    with page.expect_response(lambda response: response.url.endswith('/api/auth/phone/verify') and response.request.method == 'POST') as verified:
        page.get_by_role('button', name='登录，把奇妙带走', exact=True).click()
    assert verified.value.ok, verified.value.status
    result = verified.value.json()
    expect(page.locator('.account-identity')).to_be_visible()
    expect(page.locator('.identity-stats')).to_contain_text('注册收藏家')
    assert 'token=' not in page.url and result['token'] not in page.url
    return result


def logout(page):
    account(page)
    page.get_by_role('button', name='退出登录', exact=True).click()
    expect(page.locator('#account-phone')).to_be_visible()


def navigate_club(page, text):
    home(page)
    page.locator('.club-links button').filter(has_text=text).click()


def browser_api(page, path):
    return page.evaluate("""async ({base,path}) => {
      const key = Object.keys(sessionStorage).find(key => key.startsWith('wonder-pocket:session:'));
      const token = key ? sessionStorage.getItem(key) : '';
      const response = await fetch(base + path, {headers: token ? {Authorization: 'Bearer ' + token} : {}});
      return {status:response.status, data:await response.json()};
    }""", {'base': API, 'path': path})


processes = []
log_files = []
page = None
playwright = None
errors = []
try:
    for name, command, extra_env in [
        ('fixture', ['node', 'tests/cloud-browser-fixture.mjs'], {'POCKET_FIXTURE_PORT': '3002', 'POCKET_FIXTURE_ORIGIN': APP}),
        ('vite', ['npm', 'exec', '--', 'vite', '--host', '127.0.0.1', '--port', '5181', '--strictPort'], {'VITE_API_BASE_URL': API}),
    ]:
        output = (OUTPUT / f'{name}.log').open('w')
        log_files.append(output)
        environment = dict(os.environ)
        environment.update(extra_env)
        process = subprocess.Popen(command, cwd=ROOT, env=environment, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
        processes.append(process)
        wait_ready(API + '/api/health' if name == 'fixture' else APP, process)
    info = fixture('/__test/info')
    playwright = sync_playwright().start()
    browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True, timezone_id='UTC')
    context.add_init_script("""{
      const NativeDate = Date;
      const testNow = NativeDate.parse('2026-10-13T16:30:00Z');
      // Freeze Date only; animation timers still run normally. This tests calendar-day disagreement.
      globalThis.Date = class extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [testNow])); }
        static now() { return testNow; }
      };
    }""")
    page = context.new_page()
    page.set_default_timeout(12000)
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(APP, wait_until='networkidle')
    if page.get_by_role('button', name='好啦，去掏口袋').is_visible():
        page.get_by_role('button', name='好啦，去掏口袋').click()
    page.evaluate("""async () => {
      const game = await import('/src/lib/game.js');
      const guest = game.createState();
      guest.collected = ['dream-radio'];
      guest.favorites = ['dream-radio'];
      guest.usage.help = 2;
      guest.settings.guideSeen = true;
      guest.entitlements = ['fabricated-season'];
      guest.memberUntil = Date.now() + 999999999;
          guest.customGadgets = Array.from({length:32}, (_,index) => ({
            ...game.GADGETS[0], id: 'guest-heavy-' + index,
            name: '游客长文本道具' + index, effect: '很长的本地收藏设定'.repeat(150),
          }));
      localStorage.setItem(game.STORAGE_KEY, JSON.stringify(guest));
    }""")
    page.reload(wait_until='networkidle')
    expect(page.locator('.usage-note')).to_have_text('今日剩余 1 / 3 次')

    registered = login(page, OWNER_PHONE, check_invalid=True)
    assert registered['limits']['help']['limit'] == 5
    assert registered['limits']['blind']['limit'] == 2
    assert registered['limits']['fusion']['limit'] == 2
    assert registered['state']['collected'] == ['dream-radio']
    assert registered['state']['favorites'] == ['dream-radio']
    assert registered['state']['usage']['help'] == 0
    assert registered['user']['memberUntil'] == 0 and registered['user']['seasonalUnlocks'] == []
    assert registered['state']['customGadgets'] == []
    print('PASS cloud login: real OTP, invalid-code feedback, guest merge, registered quotas, entitlement protection')

    home(page)
    expect(page.locator('.usage-note')).to_have_text('今日剩余 5 / 5 次')
    page.locator('#worry').fill('明天汇报，有点紧张')
    with page.expect_response(lambda response: response.url.endswith('/api/play/draw')) as drawn:
        page.get_by_role('button', name='帮我找找', exact=True).click()
    draw_data = drawn.value.json()
    assert draw_data['state']['usage']['help'] == 1 and draw_data['ticket']
    expect(page.locator('.modal-card h2')).to_have_text('勇气补丁')
    with page.expect_response(lambda response: response.url.endswith('/api/play/use')) as used:
        page.get_by_role('button', name='启动道具', exact=True).click()
    used_data = used.value.json()
    assert used_data['state']['usage']['help'] == 1, 'Draw and activation must consume one quota via a server-issued ticket'
    assert len(used_data['state']['history']) == 1
    expect(page.locator('.outcome-card')).to_be_visible()
    page.evaluate("""() => {
      Object.defineProperty(navigator, 'canShare', {value: () => true, configurable: true});
      Object.defineProperty(navigator, 'share', {value: async () => undefined, configurable: true});
    }""")
    page.get_by_role('button', name='做成明信片', exact=True).click()
    with page.expect_response(lambda response: response.url.endswith('/api/play/share')) as shared:
        page.locator('.poster-secondary').click()
    assert shared.value.json()['state']['shareRewards']['credits'] == 1
    page.get_by_role('button', name='关闭海报窗口').click()
    page.get_by_role('button', name='关闭', exact=True).click()
    expect(page.locator('.usage-note')).to_have_text('今日剩余 4 / 5 次')
    page.get_by_role('button', name='道具图鉴', exact=True).click()
    with page.expect_response(lambda response: response.url.endswith('/api/state/preferences')):
        page.get_by_role('button', name='心选勇气补丁', exact=True).click()
    expect(page.get_by_role('button', name='取消心选勇气补丁', exact=True)).to_have_attribute('aria-pressed', 'true')
    page.reload(wait_until='networkidle')
    expect(page.locator('.usage-note')).to_have_text('今日剩余 4 / 5 次')
    page.get_by_role('button', name='道具图鉴', exact=True).click()
    expect(page.get_by_role('button', name='取消心选勇气补丁', exact=True)).to_be_visible()
    page.get_by_role('tab', name='最近奇遇', exact=True).click()
    expect(page.locator('.history-card')).to_have_count(1)
    home(page)
    page.route(API + '/api/play/draw', lambda route: route.abort('failed'))
    page.locator('#worry').fill('这一次云端暂时断开')
    page.get_by_role('button', name='帮我找找', exact=True).click()
    expect(page.get_by_role('status')).to_contain_text('连接不到云端')
    expect(page.locator('.usage-note')).to_have_text('今日剩余 4 / 5 次')
    expect(page.locator('.gadget-modal')).to_have_count(0)
    page.unroute(API + '/api/play/draw')
    print('PASS cloud gameplay: server draw ticket, single quota consumption, history, confirmed share reward, favorite/session reload')

    blind_requests = []
    def count_blind_request(request):
        if request.url.endswith('/api/play/draw') and request.method == 'POST' and request.post_data_json.get('kind') == 'blind':
            blind_requests.append(request.url)
    page.on('request', count_blind_request)
    for index in range(2):
        with page.expect_response(lambda response: response.url.endswith('/api/play/draw')) as fortune:
            page.locator('.fortune-pill').click()
        assert fortune.value.ok
        assert fortune.value.json()['state']['usage']['blind'] == index + 1
        expect(page.locator('.fortune-content')).to_be_visible()
        fortune_name = page.locator('.modal-card h2').inner_text()
        page.get_by_role('button', name='收下今天的好运', exact=True).click()
    page.locator('.fortune-pill').click()
    expect(page.locator('.fortune-content')).to_be_visible()
    expect(page.locator('.modal-card h2')).to_have_text(fortune_name)
    assert len(blind_requests) == 2, 'Reviewing the last fortune must not spend a third quota despite different browser/server dates'
    page.get_by_role('button', name='关闭', exact=True).click()
    page.remove_listener('request', count_blind_request)
    print('PASS cloud fortune: two registered draws then quota-free replay across UTC/Shanghai calendar days')

    account(page)
    with page.expect_response(lambda response: response.url.endswith('/api/state/preferences')):
        page.get_by_role('checkbox', name='允许匿名玩法统计').check()
    page.reload(wait_until='networkidle')
    account(page)
    expect(page.get_by_role('checkbox', name='允许匿名玩法统计')).to_be_checked()
    with page.expect_response(lambda response: response.url.endswith('/api/state/preferences')):
        page.get_by_role('checkbox', name='允许匿名玩法统计').uncheck()
    navigate_club(page, '口袋商店')
    page.get_by_role('button', name=re.compile(r'^我的订单')).click()
    expect(page.locator('.order-card')).to_have_count(1)
    expect(page.locator('.order-card')).to_contain_text('浏览器测试月卡订单')

    navigate_club(page, '脑洞投稿箱')
    page.locator('#idea-name').fill('周三晴天小茶杯')
    page.locator('#idea-effect').fill('让疲惫的一天留出一杯温茶的时间。')
    page.locator('#idea-warning').fill('喝太快，茶杯会打一个小小的饱嗝。')
    with page.expect_response(lambda response: response.url.endswith('/api/ideas') and response.request.method == 'POST') as submitted:
        page.get_by_role('button', name='把脑洞放进口袋', exact=True).click()
    assert submitted.value.status == 201
    page.get_by_role('button', name=re.compile(r'^我的投稿')).click()
    expect(page.locator('.my-idea')).to_contain_text('周三晴天小茶杯')
    expect(page.locator('.submission-status')).to_have_text('等待审核')
    page.get_by_role('button', name=re.compile(r'^大家的奇思妙想')).click()
    expect(page.locator('.public-idea')).to_have_count(0)

    logout(page)
    home(page)
    expect(page.locator('.usage-note')).to_have_text('今日剩余 1 / 3 次')
    page.get_by_role('button', name='道具图鉴', exact=True).click()
    expect(page.locator('.atlas-card:not(.locked)')).to_have_count(1)
    expect(page.locator('.atlas-card:not(.locked)')).to_contain_text('晚安收音机')
    assert json.loads(page.evaluate("localStorage.getItem('wonder-pocket:v1')"))['usage']['help'] == 2
    print('PASS privacy/state: opt-in preference persists; logout restores separate guest data')

    login(page, SECOND_PHONE)
    navigate_club(page, '口袋商店')
    page.get_by_role('button', name=re.compile(r'^我的订单')).click()
    expect(page.locator('.order-card')).to_have_count(0)
    response = browser_api(page, '/api/orders/' + info['orderId'])
    assert response['status'] == 404 and response['data']['ok'] is False
    navigate_club(page, '脑洞投稿箱')
    page.get_by_role('button', name=re.compile(r'^我的投稿')).click()
    expect(page.locator('.my-idea')).to_have_count(0)
    assert browser_api(page, '/api/admin/ideas')['status'] == 403
    logout(page)

    login(page, ADMIN_PHONE)
    navigate_club(page, '脑洞投稿箱')
    page.get_by_role('button', name=re.compile(r'^投稿审核')).click()
    expect(page.locator('.moderation-card')).to_contain_text('周三晴天小茶杯')
    with page.expect_response(lambda response: '/api/admin/ideas/' in response.url and response.request.method == 'PATCH') as approved:
        page.get_by_role('button', name='审核通过，收录', exact=True).click()
    assert approved.value.ok
    expect(page.locator('.moderation-card')).to_have_count(0)
    home(page)
    page.locator('#worry').fill('明天汇报，有点紧张')
    page.get_by_role('button', name='帮我找找', exact=True).click()
    expect(page.locator('.modal-card h2')).to_have_text('勇气补丁')
    revoked = page.evaluate("""async base => {
      const key = Object.keys(sessionStorage).find(key => key.startsWith('wonder-pocket:session:'));
      const response = await fetch(base + '/api/auth/logout', {
        method:'POST', headers:{Authorization:'Bearer ' + sessionStorage.getItem(key), 'Content-Type':'application/json'}, body:'{}'
      });
      return response.status;
    }""", API)
    assert revoked == 200
    with page.expect_response(lambda response: response.url.endswith('/api/play/use')) as expired:
        page.get_by_role('button', name='启动道具', exact=True).click()
    assert expired.value.status == 401
    expect(page.get_by_role('status')).to_contain_text('登录已过期')
    expect(page.locator('.gadget-modal')).to_have_count(0)
    expect(page.locator('.usage-note')).to_have_text('今日剩余 1 / 3 次')
    account(page)
    expect(page.locator('#account-phone')).to_be_visible()
    assert page.evaluate("Object.keys(sessionStorage).filter(key=>key.startsWith('wonder-pocket:session:')).length") == 0
    print('PASS expired cloud session: real server revocation, 401 restores guest data and closes stale cloud gadget without local activation')
    navigate_club(page, '脑洞投稿箱')
    expect(page.locator('.public-idea')).to_contain_text('周三晴天小茶杯')
    expect(page.locator('.public-idea')).to_contain_text('口袋创想家')
    expect(page.get_by_role('button', name='登录后投递脑洞', exact=True)).to_be_disabled()
    page.screenshot(path=str(OUTPUT / 'public-community.png'), full_page=True)
    assert not errors, errors
    print('PASS community/authorization: pending privacy, owner-only orders/ideas, admin-only moderation, public approved listing')
    context.close()
    browser.close()
except Exception:
    if page is not None and not page.is_closed():
        try:
            page.screenshot(path=str(OUTPUT / 'failure.png'), full_page=True)
            (OUTPUT / 'failure.html').write_text(page.content(), encoding='utf-8')
            (OUTPUT / 'failure.json').write_text(json.dumps({'url': page.url, 'pageErrors': errors, 'title': page.title()}, ensure_ascii=False), encoding='utf-8')
        except Exception:
            pass
    raise
finally:
    if playwright is not None:
        playwright.stop()
    for process in reversed(processes):
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=5)
    for output in log_files:
        output.close()
