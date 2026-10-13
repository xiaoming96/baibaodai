/** Offline pocket stories. Every item and story is original. No credentials required. */
export const STORAGE_KEY = 'wonder-pocket:v1';
export const DAILY_LIMITS = Object.freeze({ help: 3, blind: 1, fusion: 1 });
export const REPAIR_MS = 24 * 60 * 60 * 1000;

const catalog = [
  {
    id: 'courage-badge', no: '001', name: '勇气补丁', category: '日常治愈', rarity: '普通', kind: 'badge', color: '#dd8861', maxDurability: 6,
    effect: '把心里的小小底气缝到胸口，重要时刻敢说第一句话。', warning: '信心过满时，可能会把自我介绍说成获奖感言。',
    keywords: ['汇报', '紧张', '面试', '演讲', '社恐', '勇气', '开会'],
    fortune: { good: '勇敢开口', bad: '反复排练坏结局', tip: '你不用表现完美，先把第一句话说出来。' },
    stories: ['你终于说出了准备已久的话。声音抖了一小下，但大家都认真听了。', '补丁把你的开场白放大了三倍。你说完“大家好”，全屋同事都跟着鼓起掌来。', '勇气一路涨到爆表，你把工作汇报讲成了个人巡回演唱会。老板居然开始打拍子。', '你不仅顺利讲完，还发现另一位紧张的同事被你带着放松下来。勇气原来会传染。'],
  },
  {
    id: 'pause-clock', no: '012', name: '摸鱼沙漏', category: '日常治愈', rarity: '普通', kind: 'hourglass', color: '#d4aa5a', maxDurability: 6,
    effect: '把忙碌的一天悄悄拉长，留出一小段属于你的空白。', warning: '休息太舒服，沙子可能集体决定不上班。',
    keywords: ['工作', '上班', '加班', '累', '休息', '摸鱼', '请假', '忙'],
    fortune: { good: '给自己留白', bad: '把休息也列成任务', tip: '发呆不是浪费时间，是给心充个电。' },
    stories: ['时间慢了半拍。你喝完一杯温水，伸了个懒腰，事情也终于有了顺序。', '沙漏争取到了休息时间，可你盯着它发呆，忘记自己本来要休息。', '沙子宣布罢工，整层办公室进入周末模式。打印机都开始放度假音乐了。', '你休息了一会儿，回来发现同事已经帮你解决最麻烦的那件事。今天有人接住你了。'],
  },
  {
    id: 'dream-radio', no: '023', name: '晚安收音机', category: '日常治愈', rarity: '普通', kind: 'radio', color: '#8998ab', maxDurability: 6,
    effect: '调到只属于你的晚安频道，让脑内小剧场提前散场。', warning: '偶尔会收到隔壁小猫的梦境广播。',
    keywords: ['失眠', '睡', '熬夜', '晚安', '噩梦', '焦虑'],
    fortune: { good: '早点收工', bad: '睡前复盘人生', tip: '今天想不通的事，可以交给明天的枕头。' },
    stories: ['收音机轻轻说了一句“辛苦了”。你眼皮慢慢合上，明天的事明天再想。', '频道混进了小猫的梦话。你梦见自己追着一条鱼跑，醒来时枕头倒是很香。', '广播把全屋家具都哄睡了。闹钟打着呼噜，只有你负责给它们盖被子。', '你睡了一个没有待办清单的好觉。梦里，还遇见了小时候最喜欢的那个夏天。'],
  },
  {
    id: 'focus-lamp', no: '036', name: '专注萤火灯', category: '日常治愈', rarity: '普通', kind: 'lamp', color: '#9ba96c', maxDurability: 6,
    effect: '把乱飞的思绪收进一束暖光，先照亮眼前的一小步。', warning: '照得太久，可能连发呆都变得格外专注。',
    keywords: ['拖延', '专注', '学习', '考试', '写', '赶', '任务', '分心'],
    fortune: { good: '先做五分钟', bad: '同时打开二十个标签页', tip: '不用一口气翻过山，先走到下一棵树。' },
    stories: ['光落在手边最小的那件事上。你做完一小步，又自然做完了下一步。', '灯光照到了桌上的零食，你认真研究了半小时饼干的花纹，随后才想起任务。', '专注模式锁定了转椅。你研究出十二种旋转姿势，还给它们写了操作手册。', '你进入久违的心流，提前收工。窗边恰好亮起一只萤火虫，像来替你打了个勾。'],
  },
  {
    id: 'mood-umbrella', no: '045', name: '好心情晴雨伞', category: '日常治愈', rarity: '稀有', kind: 'umbrella', color: '#c87566', maxDurability: 4,
    effect: '给心里的阴天撑一把小伞，让坏情绪有地方慢慢落下。', warning: '眼泪可能变成会唱歌的小雨点。',
    keywords: ['难过', '伤心', '烦', '心情', '委屈', '哭', '失落'],
    fortune: { good: '允许自己不开心', bad: '硬撑着说没事', tip: '有些天只要平安过去，就已经很棒。' },
    stories: ['伞下安静了一点。烦恼还在，但你终于可以坐下来，慢慢喘一口气。', '小雨点把你的叹气编成了一首歌，唱得有点跑调，你没忍住笑了。', '伞把烦恼变成了会打喷嚏的云。你一路走，一路给小云递纸巾，自己倒忘了难过。', '伞下多出一个座位。有人走来听你讲完了今天，天空也悄悄放晴。'],
  },
  {
    id: 'detour-compass', no: '057', name: '慢半拍指南针', category: '冒险搞怪', rarity: '普通', kind: 'compass', color: '#b89963', maxDurability: 5,
    effect: '给犹豫不决的人指一条小路，偶尔带你绕去好风景。', warning: '它的“最佳路线”经常经过一家很好吃的小店。',
    keywords: ['选择', '决定', '迷茫', '路', '方向', '旅行'],
    fortune: { good: '走一条新路', bad: '在起点想太久', tip: '绕一点路也没关系，生活不只有最短路线。' },
    stories: ['指针停在一条可行的小路上。你先迈出一步，方向也跟着清晰起来。', '指针认真把你带到了面包店。路线确实绕了些，但刚出炉的面包很有说服力。', '指南针把你当成了目的地，路人都跟着你走。你一不小心成了临时导游。', '你沿着小路遇见一个老朋友。原来这次绕路，是生活给你安排的小小重逢。'],
  },
  {
    id: 'memory-camera', no: '068', name: '小确幸相机', category: '日常治愈', rarity: '稀有', kind: 'camera', color: '#b48973', maxDurability: 4,
    effect: '拍下平凡日子里被忽略的好事，把它洗成一张小照片。', warning: '不小心会把昨天吃的午饭洗出十张。',
    keywords: ['怀念', '童年', '回忆', '想家', '幸福', '无聊'],
    fortune: { good: '记录小事', bad: '只记得坏消息', tip: '今天也许普通，但总有一束光值得留下。' },
    stories: ['照片里出现了你忽略的小事：一杯刚好的热茶、一个认真回应你的笑脸。', '相机吐出九张午饭照和一张你的笑脸。它说，吃饱也算很重要的幸福。', '照片开始现场重播，你昨天的喷嚏在客厅循环播放，连猫都学会了那个节奏。', '相纸上竟然出现小时候家门口的夕阳。你想起来，自己一直有被好好爱过。'],
  },
  {
    id: 'snack-bottle', no: '079', name: '嘴馋暂停罐', category: '整蛊恶作剧', rarity: '普通', kind: 'bottle', color: '#c2a677', maxDurability: 5,
    effect: '把冲动先装进小罐子，给身体一点慢慢选择的时间。', warning: '罐子也很爱零食，开盖时可能听见咀嚼声。',
    keywords: ['减肥', '吃', '嘴', '零食', '胖', '奶茶', '食欲'],
    fortune: { good: '好好吃一顿饭', bad: '因为一口零食责怪自己', tip: '照顾身体，不必靠和自己较劲。' },
    stories: ['冲动在罐子里歇了一会儿。你喝了水，再认真决定现在想吃什么。', '罐子偷吃了一块饼干，留下字条：“这个真的很好吃，批准你慢慢品尝。”', '罐子开了一家零食讨论会，桌上每块饼干都在自我介绍。你被迫当主持人。', '你发现自己其实只是累了。罐子送来一杯温水，你安心休息了一会儿。'],
  },
  {
    id: 'word-tape', no: '083', name: '话语软糖胶带', category: '日常治愈', rarity: '普通', kind: 'tape', color: '#a790a8', maxDurability: 6,
    effect: '给想说的话加一点温柔，让沟通不那么扎手。', warning: '甜度过高会让“收到”听起来像情书。',
    keywords: ['沟通', '吵架', '同事', '关系', '朋友', '告白', '恋爱', '对象'],
    fortune: { good: '好好说一句谢谢', bad: '猜对方没说出口的话', tip: '温柔不是退让，是把心里的话说清楚。' },
    stories: ['你把真正想说的话慢慢讲出来。对方也放下防备，你们终于听懂了彼此。', '胶带把“收到”变成了“收到啦，愿你今天像小蛋糕一样幸福”。群聊安静了三秒。', '所有标点都变成了爱心。你发出的会议通知像婚礼请柬，连打印机都脸红了。', '一句诚恳的表达，换来一场久违的好好聊天。原来你们一直站在同一边。'],
  },
  {
    id: 'hope-sprout', no: '096', name: '明天发芽盆', category: '日常治愈', rarity: '普通', kind: 'sprout', color: '#87966b', maxDurability: 5,
    effect: '把一件小小的期待种下，让明天长出一点绿意。', warning: '浇太多焦虑，盆里会长出待办清单。',
    keywords: ['希望', '未来', '生活', '努力', '放弃', '压力', '目标'],
    fortune: { good: '种下一点期待', bad: '一天催芽八次', tip: '不是每一种成长，都要立刻开花。' },
    stories: ['盆里冒出一片嫩叶。你为明天留了一件小期待，今天也就有了柔软的结尾。', '嫩叶上写着“记得喝水”。它暂时没给人生答案，却先把你照顾了一下。', '花盆长出了一米高的待办清单。你决定先给它剪枝，发现少做几件也完全没事。', '你以为还没发芽，转过盆才看到背面开了花。有些进展一直在悄悄发生。'],
  },
  {
    id: 'lucky-bell', no: '107', name: '迟到半分钟铃', category: '冒险搞怪', rarity: '普通', kind: 'bell', color: '#d0a150', maxDurability: 5,
    effect: '在匆忙时借来半分钟，提醒你带齐自己再出门。', warning: '铃声有时会召集附近所有小狗。',
    keywords: ['迟到', '通勤', '地铁', '时间', '赶车', '出门'],
    fortune: { good: '从容一点', bad: '用奔跑证明勤奋', tip: '慢半步也好，别把自己落在身后。' },
    stories: ['铃响了一下，你刚好赶上电梯，还想起了落在桌上的钥匙。', '铃召来了三只小狗，它们热情护送你到了公交站，迟到的理由也变可爱了。', '整条街的闹钟一起鸣响，你带着一支晨间乐队赶路。交警都开始跟着打节拍。', '你从容赶上车，恰好有靠窗座位。阳光刚刚好，今天从一段温柔的路开始。'],
  },
  {
    id: 'invisible-sock', no: '118', name: '存在感调节袜', category: '整蛊恶作剧', rarity: '普通', kind: 'sock', color: '#bc8278', maxDurability: 5,
    effect: '把存在感调小一点，给想躲一会儿的自己留个角落。', warning: '只有袜子隐身时，会像光着脚参加会议。',
    keywords: ['尴尬', '社交', '躲', '聚会', '孤独', '独处'],
    fortune: { good: '留一点独处时间', bad: '勉强自己热闹', tip: '安静的人，也有自己明亮的世界。' },
    stories: ['你找到一个舒服的角落，没人催你说话。安安静静待一会儿也很自在。', '袜子率先隐身，你本人还在。大家担心你冷，齐齐递来室内拖鞋。', '存在感旋钮拧反，你成了聚会的灯球。你每点一次头，满屋就闪一次温柔的彩光。', '你安静地坐着，却遇见一个同样喜欢安静的人。两个人不说话，也没有尴尬。'],
  },
  {
    id: 'worry-balloon', no: '129', name: '烦恼放飞气球', category: '冒险搞怪', rarity: '稀有', kind: 'balloon', color: '#c68169', maxDurability: 4,
    effect: '把暂时解不开的烦恼绑起来，放远一点再看。', warning: '气球飞得太低时，会被路边树枝劝回来。',
    keywords: ['烦恼', '纠结', '放下', '担心', '内耗'],
    fortune: { good: '暂时放过自己', bad: '和昨天反复争论', tip: '不是每个结都要今天解开。' },
    stories: ['气球带着烦恼飘高了一点。你发现，拉开距离后它没有想象中那么大。', '气球挂在了树上，小鸟替你读完烦恼，留下一句“先吃饭吧”。', '气球把烦恼吹成了游行标语。你带着一队路人绕街一圈，竟然收到不少拥抱。', '气球飞回来时带着一封小纸条：“事情会慢慢过去，你已经很努力了。”'],
  },
  {
    id: 'wish-star', no: '201', name: '口袋流星', category: '稀有传说', rarity: '传说', kind: 'star', color: '#c3a05c', maxDurability: 2,
    effect: '给一个小愿望一点推力，照亮你愿意迈出的第一步。', warning: '愿望说太快，流星会把“中奖”听成“中姜”。',
    keywords: ['愿望', '好运', '幸运', '中奖', '梦想'],
    fortune: { good: '认真许个小愿望', bad: '把幸福全交给运气', tip: '愿望不必很大，能让你笑一下就好。' },
    stories: ['流星划过口袋边缘，你为小愿望迈出了第一步。它没有替你走路，却照亮了路。', '流星听错了一个字，送来一块生姜和一张“祝你暖暖的”小卡。', '愿望放大了一百倍，你想要一杯奶茶，门口却停了一辆珍珠奶茶运货车。', '流星落下一束刚刚好的好运。你等了很久的消息来了，还有一份意外的小礼物。'],
  },
  {
    id: 'gentle-cloud', no: '214', name: '拥抱棉花云', category: '稀有传说', rarity: '传说', kind: 'cloud', color: '#aaa7b6', maxDurability: 2,
    effect: '变成一团轻轻的拥抱，给没有说出口的辛苦一个回应。', warning: '抱得太久，可能会被当成新款枕头。',
    keywords: ['拥抱', '孤单', '累了', '安慰', '想念'],
    fortune: { good: '接受一点温柔', bad: '把所有事独自扛下', tip: '不用先变得优秀，才值得被拥抱。' },
    stories: ['棉花云轻轻抱住你。它什么也没催，只说了一句：“今天这样就很好。”', '云抱着抱着睡着了，你只好反过来拍拍它。原来云也有辛苦的一天。', '云呼朋引伴，客厅变成软绵绵的云海。你找了半天沙发，索性躺在晚霞上。', '云里传来一句你一直想听的话：“我知道，你已经尽力了。”心里紧绷的地方终于松开。'],
  },
  {
    id: 'tomorrow-key', no: '228', name: '明日小门钥匙', category: '冒险搞怪', rarity: '稀有', kind: 'key', color: '#a89672', maxDurability: 3,
    effect: '为卡住的日常开一条小缝，让新可能透进来。', warning: '钥匙偶尔会打开零食柜，假装那也是新世界。',
    keywords: ['改变', '开始', '新', '卡住', '机会'],
    fortune: { good: '试一点新东西', bad: '等万事俱备才开始', tip: '门只开了一条缝，也足够透进一束光。' },
    stories: ['一扇小门打开了。你看到一种没试过的办法，决定先轻轻推一下。', '小门通往零食柜。你补充能量后，确实想到了一个新点子。', '门开到了洗衣机里，你遇见了多年来失踪的袜子。它们成立了自己的小社区。', '门后是一条你喜欢的新路。你发现改变不一定轰轰烈烈，也可以很轻很轻。'],
  },
];

export const GADGETS = Object.freeze(catalog.map((item) => Object.freeze({
  ...item, durability: item.maxDurability, visual: Object.freeze({ kind: item.kind, color: item.color }),
})));
export const gadgets = GADGETS;
export const OUTCOME_KINDS = Object.freeze(['normal', 'oops', 'chaos', 'surprise']);
const TITLES = { normal: '刚刚好的小魔法', oops: '哎呀，出了一点小乌龙', chaos: '事情朝奇怪的方向发展了！', surprise: '口袋送你一份意外惊喜' };
const eventCatalog = [
  { id: 'wind', title: '一阵风偷偷路过', text: '风把道具的作用范围吹大了一圈，旁边的人也分到了同样的效果。', effect: '作用范围扩大', suffix: '身边的人也分到了一点效果，大家互相看了一眼，忍不住笑了。' },
  { id: 'screw', title: '一颗螺丝钉掉了下来', text: '螺丝钉碰到了旋钮，效果持续时间缩短了一半。', effect: '持续时间减半', suffix: '效果只持续了原来的一半，好在你抓住了这段短短的时间。' },
  { id: 'slip', title: '哎呀，手滑了一下', text: '道具磕到桌角，需要先轻轻摇三下才能生效。', effect: '生效延迟', suffix: '你又认真摇了三下，魔法才迟迟赶到，还附赠一声小小的打嗝。' },
  { id: 'cat', title: '一只小猫按下隐藏按钮', text: '小猫碰到一个按钮，道具切换到“猫语播报”模式。', effect: '猫语隐藏模式', suffix: '整个过程还配了猫语播报。你一句没听懂，却觉得被认真鼓励了。' },
];
const chainStories = {
  'courage-badge': ['补丁记住了刚才的气氛，现在见谁都自动鞠躬。要不要让它先歇一会儿？', '见到谁都忍不住鞠躬，有点尴尬'],
  'pause-clock': ['沙子尝到了休息的甜头，抱着袋口不肯复工。还得请个小帮手把它们哄回来。', '时间慢下来之后，我有点担心赶不上地铁'],
  'dream-radio': ['晚安频道忘了关，桌上的闹钟也开始打瞌睡。得找个道具把早晨轻轻叫醒。', '怕闹钟睡过头，明天上班迟到'],
  'focus-lamp': ['灯光太认真，开始追着你照到每个角落。想休息的话，需要先说服它下班。', '已经专注完成任务了，现在想休息一会儿'],
  'mood-umbrella': ['小雨点唱完一曲，还想加演。你得给它们找一个安静的晚安频道。', '小雨点还在唱歌，想早点睡觉'],
  'detour-compass': ['指针爱上了绕路，开始推荐下一家小店。要不要先把回家的时间找回来？', '走了太多弯路，担心回家迟到'],
  'memory-camera': ['相机迟迟不肯收工，连你眨眼都想拍下来。需要一点点安静的私人空间。', '相机一直拍我，想躲一会儿'],
  'snack-bottle': ['罐子还在认真推荐饼干口味。得找个道具，让它也学会休息。', '零食罐太热情了，想转移注意力专注一点'],
  'word-tape': ['胶带把自己的道歉信也写得太甜，便签都开始脸红。先让气氛冷静一点吧。', '说话太甜有点尴尬，想安静独处一会儿'],
  'hope-sprout': ['嫩叶开始每天问一次“明天到了吗”。你想送它一点不着急的耐心。', '一直担心未来，想放下焦虑休息一下'],
  'lucky-bell': ['铃铛觉得刚才的演出很成功，还想继续叫醒全街。该给它准备一句晚安了。', '铃铛响个不停，想让它安静睡觉'],
  'invisible-sock': ['袜子藏得太好了，洗衣机都找不到它。你需要一点新方向，把它领回家。', '袜子迷路了，想找到回家的方向'],
  'worry-balloon': ['气球舍不得离开，给你寄来一串自己的烦恼。要给它也种一点明天的希望。', '气球也有压力，想给它一点希望'],
  'wish-star': ['流星忙着实现愿望，忘记了自己也要充电。找件小道具陪它好好休息吧。', '流星工作太累了，想让它休息'],
  'gentle-cloud': ['棉花云抱得太舒服，不肯松开。需要一个小小的开场白，温柔地和它沟通。', '想温柔地沟通，让棉花云松开拥抱'],
  'tomorrow-key': ['新门开了一条缝，钥匙却开始犹豫要不要再多开一点。给它借一点勇气吧。', '新机会来了却很紧张，想勇敢迈出第一步'],
};

function randomIndex(length, rng) { return Math.min(length - 1, Math.max(0, Math.floor(rng() * length))); }
export function matchGadget(worry = '', unlockedIds = [], rng = Math.random) {
  const query = String(worry).trim().toLowerCase();
  const scores = GADGETS.map((gadget) => ({ gadget, score: gadget.keywords.filter((word) => query.includes(word)).length }));
  const top = Math.max(...scores.map(({ score }) => score));
  if (top > 0) {
    const candidates = scores.filter(({ score }) => score === top).map(({ gadget }) => gadget);
    // Prefer a new find when two tools fit equally well; discovery never changes relevance.
    const unseen = candidates.filter((gadget) => !unlockedIds.includes(gadget.id));
    const pool = unseen.length ? unseen : candidates;
    return pool[randomIndex(pool.length, rng)];
  }
  const gentle = GADGETS.filter((gadget) => gadget.category === '日常治愈');
  return gentle[randomIndex(gentle.length, rng)];
}
export function drawRandomGadget(rng = Math.random, pool = GADGETS) {
  if (!Array.isArray(pool) || !pool.length) return null;
  return pool[randomIndex(pool.length, rng)];
}
export function strengthTier(value = 50) {
  const strength = Math.max(0, Math.min(100, Number(value) || 0));
  return strength < 34 ? 'safe' : strength < 67 ? 'regular' : 'wild';
}
export function outcomeWeights(value = 50) {
  const tier = typeof value === 'string' ? value : strengthTier(value);
  const raw = tier === 'safe' ? [70, 25, 0, 5] : tier === 'wild' ? [10, 20, 70, 10] : [40, 40, 15, 5];
  const sum = raw.reduce((total, weight) => total + weight, 0);
  return Object.fromEntries(OUTCOME_KINDS.map((kind, index) => [kind, raw[index] / sum]));
}
export function generateOutcome(gadget, worry = '', strength = 50, rng = Math.random) {
  if (!gadget) throw new TypeError('A gadget is required to tell a pocket story.');
  const weights = outcomeWeights(strength);
  const roll = Math.max(0, Math.min(1 - Number.EPSILON, rng()));
  let cumulative = 0;
  const kind = OUTCOME_KINDS.find((candidate) => { cumulative += weights[candidate]; return roll < cumulative; }) || 'surprise';
  const storyIndex = OUTCOME_KINDS.indexOf(kind);
  const base = gadget.stories?.[storyIndex] || [
    `${gadget.name}稳稳发挥了作用。事情没有一下变完美，但你找到了可以开始的一小步。`,
    `${gadget.name}把两种效果弄反了一小下。你忙着收拾场面，倒也忘了原来的烦恼。`,
    `${gadget.name}兴奋过了头，整个房间都加入了这场奇怪的实验。最后大家笑得停不下来。`,
    `${gadget.name}送来一份超出预期的小惊喜。原来两件小魔法凑在一起，真的会发生好事。`,
  ][storyIndex];
  const event = rng() < 0.3 ? { ...eventCatalog[randomIndex(eventCatalog.length, rng)] } : null;
  const continuation = chainStories[gadget.id] || [`${gadget.name}的两个功能开始抢着工作，要不要找件道具让它们轮流休息？`, '两个道具效果抢着工作，想让场面平静下来'];
  const chain = rng() < 0.2 ? {
    id: `after-${gadget.id}`, title: '后续来了，要不要再补救一下？',
    text: continuation[0], worry: continuation[1],
  } : null;
  return {
    kind, title: TITLES[kind], text: event ? `${base}\n\n${event.suffix}` : base,
    event, chain, gadgetId: gadget.id, gadgetName: gadget.name, worry: String(worry).slice(0, 100), strength: Math.max(0, Math.min(100, Number(strength) || 0)),
  };
}

export function localDay(now = Date.now()) {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function createState(now = Date.now()) {
  return {
    version: 1, collected: [], customGadgets: [], events: [], eventRecords: [], achievements: [],
    usage: { date: localDay(now), help: 0, blind: 0, fusion: 0 },
    durability: {}, repair: { date: localDay(now), used: 0 },
    stats: { totalUses: 0, chaosStreak: 0, maxChaosStreak: 0, fusions: 0, surprises: 0 },
    settings: { sound: false }, lastFortune: null, todayGadgetId: null,
  };
}
export function ensureDaily(state, now = Date.now()) {
  const day = localDay(now);
  if (state.usage?.date !== day) state.usage = { date: day, help: 0, blind: 0, fusion: 0 };
  if (state.repair?.date !== day) state.repair = { date: day, used: 0 };
  return state;
}
function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function nonnegative(value, fallback = 0) { return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback; }
export function loadState(storage, now = Date.now()) {
  const fallback = createState(now);
  try {
    if (storage === undefined) storage = globalThis.localStorage;
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw);
    if (!isRecord(saved) || saved.version !== 1) return fallback;
    for (const key of ['collected', 'events', 'achievements']) {
      if (Array.isArray(saved[key])) fallback[key] = [...new Set(saved[key].filter((item) => typeof item === 'string'))];
    }
    if (Array.isArray(saved.eventRecords)) {
      const seen = new Set();
      fallback.eventRecords = saved.eventRecords.filter((record) => {
        if (!isRecord(record) || !['oops', 'chaos', 'event'].includes(record.kind)) return false;
        if (!['id', 'title', 'text', 'gadgetName'].every((key) => typeof record[key] === 'string' && record[key].length > 0)) return false;
        if (seen.has(record.id)) return false;
        seen.add(record.id); return true;
      }).map((record) => ({ id: record.id.slice(0, 200), kind: record.kind, title: record.title.slice(0, 200), text: record.text.slice(0, 5000), gadgetName: record.gadgetName.slice(0, 100) }));
    }
    if (Array.isArray(saved.customGadgets)) fallback.customGadgets = saved.customGadgets.filter((item) => isRecord(item) && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.effect === 'string' && Number.isFinite(item.maxDurability) && item.maxDurability > 0);
    if (isRecord(saved.usage) && typeof saved.usage.date === 'string') {
      fallback.usage.date = saved.usage.date;
      for (const key of Object.keys(DAILY_LIMITS)) fallback.usage[key] = nonnegative(saved.usage[key]);
    }
    if (isRecord(saved.repair) && typeof saved.repair.date === 'string') fallback.repair = { date: saved.repair.date, used: nonnegative(saved.repair.used) };
    if (isRecord(saved.durability)) {
      for (const [id, record] of Object.entries(saved.durability)) {
        if (!isRecord(record) || !Number.isFinite(record.current) || record.current < 0) continue;
        fallback.durability[id] = { current: Math.floor(record.current), repairAt: nonnegative(record.repairAt) };
      }
    }
    if (isRecord(saved.stats)) for (const key of Object.keys(fallback.stats)) fallback.stats[key] = nonnegative(saved.stats[key]);
    if (isRecord(saved.settings)) fallback.settings.sound = saved.settings.sound === true;
    if (isRecord(saved.lastFortune) && typeof saved.lastFortune.gadgetId === 'string' && typeof saved.lastFortune.date === 'string') fallback.lastFortune = { gadgetId: saved.lastFortune.gadgetId, date: saved.lastFortune.date };
    if (typeof saved.todayGadgetId === 'string') fallback.todayGadgetId = saved.todayGadgetId;
    return ensureDaily(fallback, now);
  } catch { return fallback; }
}
export function saveState(storage, state) {
  // Support saveState(state) as a convenient browser call too.
  try {
    if (state === undefined) { state = storage; storage = globalThis.localStorage; }
    storage?.setItem(STORAGE_KEY, JSON.stringify(state)); return Boolean(storage);
  }
  catch { return false; }
}
export function consumeUsage(state, type, now = Date.now()) {
  ensureDaily(state, now);
  if (!Object.hasOwn(DAILY_LIMITS, type)) return { ok: false, remaining: 0, reason: '未知玩法' };
  const limit = DAILY_LIMITS[type];
  if (state.usage[type] >= limit) return { ok: false, remaining: 0, reason: '今天的免费次数已用完，明天再来看看吧。' };
  state.usage[type] += 1;
  return { ok: true, remaining: limit - state.usage[type], reason: '' };
}
export function getDurability(state, gadget, now = Date.now()) {
  const max = gadget.maxDurability || gadget.durability || 5;
  const record = state.durability[gadget.id];
  if (!record) return { current: max, max, broken: false, repairAt: 0, remainingMs: 0 };
  if (record.current <= 0 && record.repairAt <= now) {
    record.current = max; record.repairAt = 0;
  }
  const current = Math.min(max, record.current);
  return { current, max, broken: current <= 0, repairAt: record.repairAt, remainingMs: Math.max(0, record.repairAt - now) };
}
export function useGadget(state, gadget, strength = 50, now = Date.now()) {
  const durability = getDurability(state, gadget, now);
  if (durability.broken) return { ok: false, reason: '道具正在口袋里修理，24小时后会自动恢复。', durability };
  const cost = strengthTier(strength) === 'wild' ? 2 : 1;
  const current = Math.max(0, durability.current - cost);
  state.durability[gadget.id] = { current, repairAt: current === 0 ? now + REPAIR_MS : 0 };
  return { ok: true, cost, durability: getDurability(state, gadget, now) };
}
export function repairGadget(state, gadget, now = Date.now()) {
  ensureDaily(state, now);
  const durability = getDurability(state, gadget, now);
  if (durability.current === durability.max) return { ok: false, reason: '这件道具状态很好，不需要修理。' };
  if (state.repair.used >= 1) return { ok: false, reason: '今天的免费修理已用完，明天还会有一次。' };
  state.repair.used += 1;
  state.durability[gadget.id] = { current: durability.max, repairAt: 0 };
  return { ok: true, durability: getDurability(state, gadget, now) };
}
export function collectGadget(state, gadget) {
  if (!gadget || state.collected.includes(gadget.id)) return false;
  state.collected.push(gadget.id);
  if (!GADGETS.some((item) => item.id === gadget.id) && !state.customGadgets.some((item) => item.id === gadget.id)) state.customGadgets.push(gadget);
  updateAchievements(state);
  return true;
}
export function recordOutcome(state, outcome) {
  state.stats.totalUses += 1;
  state.stats.chaosStreak = outcome.kind === 'chaos' ? state.stats.chaosStreak + 1 : 0;
  state.stats.maxChaosStreak = Math.max(state.stats.maxChaosStreak, state.stats.chaosStreak);
  if (outcome.kind === 'surprise') state.stats.surprises += 1;
  if (!Array.isArray(state.eventRecords)) state.eventRecords = [];
  const gadgetName = outcome.gadgetName || GADGETS.find((gadget) => gadget.id === outcome.gadgetId)?.name || state.customGadgets.find((gadget) => gadget.id === outcome.gadgetId)?.name || '口袋道具';
  if (outcome.kind === 'oops' || outcome.kind === 'chaos') {
    const key = `${outcome.kind}:${outcome.gadgetId}`;
    if (!state.events.includes(key)) state.events.push(key);
    if (!state.eventRecords.some((record) => record.id === key)) state.eventRecords.push({ id: key, kind: outcome.kind, title: outcome.title || TITLES[outcome.kind], text: outcome.text || `${gadgetName}留下了一段难忘的小乌龙。`, gadgetName });
  }
  if (outcome.event && !state.events.includes(outcome.event.id)) state.events.push(outcome.event.id);
  if (outcome.event && !state.eventRecords.some((record) => record.id === outcome.event.id)) state.eventRecords.push({ id: outcome.event.id, kind: 'event', title: outcome.event.title || '口袋里的小意外', text: outcome.event.text || outcome.event.effect || '道具遇上了一个出乎意料的小插曲。', gadgetName });
  return updateAchievements(state);
}
export const ACHIEVEMENTS = Object.freeze([
  { id: 'first-find', name: '口袋初相遇', description: '收藏第一件道具', symbol: '✦' },
  { id: 'collector', name: '小小收藏家', description: '收藏5件不同的道具', symbol: '▦' },
  { id: 'unlucky', name: '乌龙五连击', description: '连续触发5次大翻车', symbol: '☁' },
  { id: 'inventor', name: '脑洞研究员', description: '成功合体一件新道具', symbol: '⚗' },
  { id: 'mastermind', name: '脑洞大师', description: '合体出传说道具', symbol: '★' },
  { id: 'surprise', name: '被生活奖励', description: '遇见一次意外惊喜', symbol: '☀' },
]);
export function updateAchievements(state) {
  const conditions = {
    'first-find': state.collected.length >= 1, collector: state.collected.length >= 5,
    unlucky: state.stats.maxChaosStreak >= 5, inventor: state.stats.fusions >= 1,
    mastermind: state.customGadgets.some((gadget) => gadget.rarity === '传说'), surprise: state.stats.surprises >= 1,
  };
  const newlyUnlocked = [];
  for (const achievement of ACHIEVEMENTS) {
    if (conditions[achievement.id] && !state.achievements.includes(achievement.id)) {
      state.achievements.push(achievement.id); newlyUnlocked.push(achievement);
    }
  }
  return newlyUnlocked;
}
export function getAchievements(state) { return ACHIEVEMENTS.map((achievement) => ({ ...achievement, unlocked: state.achievements.includes(achievement.id) })); }
export function fuseGadgets(first, second, rng = Math.random) {
  if (!first || !second || first.id === second.id) return { ok: false, failed: false, reason: '选两件不同的道具，脑洞才能碰出火花。', gadget: null };
  if (rng() < 0.1) return { ok: false, failed: true, title: '噗！实验冒出一小团黑烟', text: '两件道具意见不合，只留下会打喷嚏的碎片。原来的道具都还好好的。', gadget: null };
  const legendary = rng() < 0.08;
  const name = `${first.name.slice(0, 2)}${second.name.slice(0, 2)}奇想仪`;
  const id = `fusion-${first.id}-${second.id}${legendary ? '-legendary' : ''}`;
  return {
    ok: true, failed: false, title: legendary ? '诞生了一件传说级奇想！' : '脑洞合体成功！',
    gadget: {
      id, no: `F-${first.no || 'X'}${second.no || 'Y'}`, name,
      category: legendary ? '稀有传说' : '冒险搞怪', rarity: legendary ? '传说' : '稀有', kind: 'star', color: first.color,
      visual: { kind: 'star', color: first.color }, maxDurability: legendary ? 2 : 3, durability: legendary ? 2 : 3,
      effect: `先${first.effect.replace(/[。！]$/, '')}，再${second.effect.replace(/[。！]$/, '')}。`,
      warning: `两种效果有时会轮流抢先，${first.warning.replace(/[。！]$/, '')}，还可能${second.warning.replace(/[。！]$/, '')}。`,
      keywords: [...(first.keywords || []), ...(second.keywords || [])],
      fortune: { good: '大胆试一点新想法', bad: '要求第一次就完美', tip: '奇怪的组合，也可能藏着刚刚好的答案。' },
      parents: [first.id, second.id],
    },
  };
}
export function recordFusion(state, result) {
  if (!result.ok || !result.gadget) return [];
  const before = new Set(state.achievements);
  state.stats.fusions += 1;
  collectGadget(state, result.gadget);
  updateAchievements(state);
  return ACHIEVEMENTS.filter((achievement) => state.achievements.includes(achievement.id) && !before.has(achievement.id));
}
