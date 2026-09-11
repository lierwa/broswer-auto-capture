export type FreeTextRule = Readonly<{
  promptIncludes: readonly string[]
  answer: string
}>

export type ChoiceRule = Readonly<{
  promptIncludes: readonly string[]
  preferredOptionIncludes: readonly string[]
  followUp?: string
}>

export type RecommendedFollowUpRule = Readonly<{
  promptIncludes: readonly string[]
  value: string
}>

export type InterviewAcceptanceCase = Readonly<{
  id: string
  title: string
  initialInput: string
  intentProfile: string
  freeTextRules: readonly FreeTextRule[]
  choiceRules: readonly ChoiceRule[]
  fallbackAnswer: string
  draftMustContain: readonly string[]
  hardScopeMustNotContain?: readonly string[]
  correctionAfterFirstDraft?: string
  finalDraftMustContain?: readonly string[]
  answerStrategy?: "semantic_match" | "recommended"
  maxRounds?: number
  confirmDraft?: boolean
  recommendedFollowUpRules?: readonly RecommendedFollowUpRule[]
}>

export const interviewAcceptanceCases: readonly InterviewAcceptanceCase[] = [
  {
    id: "ambiguous-microwave",
    title: "含糊微波炉目标",
    initialInput: "我要抓微波炉数据",
    intentProfile: "建立中国大陆市场公开在售微波炉的基础产品库，优先品牌官网，保留型号、完整规格、产品图片与来源；品牌范围由系统提出可核验建议。",
    choiceRules: [{
      promptIncludes: ["用途", "方向", "结果", "来源", "哪类", "数据"],
      preferredOptionIncludes: ["官网", "规格", "产品库", "指定来源并补充系统发现", "指定一个或几个平台"],
      followUp: "我限定的是中国大陆市场的品牌官网这种来源类型，不提供具体品牌名单或入口；请你按近12个月公开在售、官网有微波炉产品的可核验口径建议品牌范围，不要扩大到电商店铺。每款保留品牌、型号、产品名、完整规格参数、产品图片和官网来源链接；范围内对象缺少字段时保留型号并标注缺失。",
    }, {
      promptIncludes: ["哪类", "数据"],
      preferredOptionIncludes: ["完整商品档案"],
      followUp: "以完整产品参数档案为方向，但只需要中国大陆市场品牌官网上的品牌、型号、产品名、完整规格参数、产品图片和官网来源链接，不要求价格、促销、库存或用户评价。品牌名单和入口由系统按近12个月公开在售且官网有微波炉产品的可核验口径建议；不要扩大到电商店铺。范围内对象缺少字段时保留型号并标注缺失。",
    }, {
      promptIncludes: ["信息", "字段", "内容"],
      preferredOptionIncludes: ["规格参数为主"],
      followUp: "每款必须保留品牌、型号、产品名、完整规格参数、产品图片和官网来源链接；范围内对象缺少字段时保留型号并标注缺失。",
    }, {
      promptIncludes: ["市场", "国家", "地区"],
      preferredOptionIncludes: ["中国大陆市场", "中国大陆"],
    }],
    freeTextRules: [
      { promptIncludes: ["字段", "内容"], answer: "型号、完整规格参数、产品图片和来源链接；字段缺失时保留型号并标注缺失。" },
      { promptIncludes: ["市场", "国家", "地区"], answer: "中国大陆市场。" },
      { promptIncludes: ["品牌", "范围", "来源"], answer: "优先品牌官网。品牌候选由系统依据最近12个月公开在售目录提出可核验建议，不足和未覆盖范围要报告。" },
    ],
    fallbackAnswer: "我要建立中国大陆市场公开在售微波炉的基础产品库：优先品牌官网，保留型号、完整规格、图片和来源；品牌范围请系统提出可核验建议。",
    draftMustContain: ["微波炉", "型号", "规格", "图片", "来源"],
  },
  {
    id: "refrigerator-choice-free-text",
    title: "冰箱指定品牌选择后自由名称",
    initialInput: "我要采集冰箱产品信息",
    intentProfile: "只采集中国大陆市场一个指定品牌官网的全部冰箱；品牌为海尔；字段为型号、完整规格、主图和官网链接；缺失字段不删除型号。",
    choiceRules: [{ promptIncludes: ["范围", "品牌", "方向", "来源"],
      preferredOptionIncludes: ["指定品牌", "单一品牌", "指定平台或店铺", "品牌官方产品页"] },
    { promptIncludes: ["来源", "覆盖"], preferredOptionIncludes: ["品牌官方产品页"],
      followUp: "只采集中国大陆市场海尔品牌官网的全部冰箱；字段为型号、完整规格参数、主图和官网链接，缺失字段时保留型号并标注缺失。不要采集电商平台。" },
    { promptIncludes: ["市场", "地区"], preferredOptionIncludes: ["中国大陆官网"] }],
    freeTextRules: [
      { promptIncludes: ["品牌", "名称"], answer: "海尔。采集官网全部冰箱，字段为型号、完整规格参数、主图和官网链接；缺失字段时保留型号并标注缺失。" },
      { promptIncludes: ["市场", "地区", "销售"], answer: "中国大陆市场。品牌为海尔；采集官网全部冰箱，字段为型号、完整规格参数、主图和官网链接；缺失字段时保留型号并标注缺失。" },
      { promptIncludes: ["字段", "内容"], answer: "全部冰箱型号、完整规格参数、主图和官网链接；缺失字段保留型号并标注缺失。" },
    ],
    fallbackAnswer: "中国大陆市场海尔官网全部冰箱，采集型号、完整规格参数、主图和官网链接；字段缺失时保留型号并标注。",
    draftMustContain: ["海尔", "冰箱", "全部", "型号", "规格"],
  },
  {
    id: "official-complete-products",
    title: "完整官网产品目录",
    initialInput: "采集苹果中国官网当前全部 Mac 产品，保留产品系列、型号、起售价、完整技术规格、产品图片和官网链接；官网没有的字段标注缺失，不删除产品。",
    intentProfile: "官网当前可枚举的全部 Mac 产品，保持产品身份和字段缺失规则。",
    choiceRules: [{ promptIncludes: ["全部", "范围", "Mac"], preferredOptionIncludes: ["官网 Mac 整机产品线", "整机系列"] }],
    freeTextRules: [],
    fallbackAnswer: "按苹果中国官网当前可枚举的全部 Mac 产品处理，不扩展到零售平台。",
    draftMustContain: ["苹果", "Mac", "全部", "技术规格", "图片", "缺失"],
    hardScopeMustNotContain: ["翻新产品", "教育专属页面"],
  },
  {
    id: "recruitment-list",
    title: "招聘列表采集",
    initialInput: "我想收集一份招聘职位列表，但还没确定怎么限定范围。",
    intentProfile: "结构化招聘集合，只用联合国官方招聘来源，范围由地点和开放状态判定。",
    choiceRules: [{
      promptIncludes: ["来源", "范围", "组织", "职位"],
      preferredOptionIncludes: ["指定机构", "指定来源", "单一官网", "官方", "指定地区", "职位类别与工作地点"],
      followUp: "地区是北京，不限岗位方向；只用联合国官方招聘网站，覆盖当前仍开放的全部职位，排除已过期职位。字段为职位名称、部门、地点、截止日期、职位编号和详情链接。",
    }],
    freeTextRules: [
      { promptIncludes: ["机构", "组织", "来源"], answer: "联合国官方招聘网站。" },
      { promptIncludes: ["地点", "状态", "范围"], answer: "不限岗位方向；只用联合国官方招聘网站，覆盖工作地点为北京、当前仍开放的全部职位，排除已过期职位。字段为职位名称、部门、地点、截止日期、职位编号和详情链接。" },
      { promptIncludes: ["岗位", "方向"], answer: "不限岗位方向；只用联合国官方招聘网站，覆盖工作地点为北京、当前仍开放的全部职位，排除已过期职位。字段为职位名称、部门、地点、截止日期、职位编号和详情链接。" },
      { promptIncludes: ["字段", "内容"], answer: "职位名称、部门、地点、截止日期、职位编号和详情链接。" },
    ],
    fallbackAnswer: "联合国官方招聘网站中工作地点为北京、当前仍开放的全部职位；字段为职位名称、部门、地点、截止日期、职位编号和详情链接。",
    draftMustContain: ["联合国", "北京", "开放", "职位", "截止日期", "职位编号"],
  },
  {
    id: "official-fact-check",
    title: "官网事实核查",
    initialInput: "核实国家图书馆官网是否发布了2026年国庆节开放安排，给出结论、页面链接、发布日期和核实时间；找不到时说明证据缺口。",
    intentProfile: "最终结果是有来源和时间边界的事实核查结论，不要求结构化数据集合。",
    choiceRules: [],
    freeTextRules: [
      { promptIncludes: ["哪个国家", "国家图书馆"], answer: "中国国家图书馆官网。" },
    ],
    fallbackAnswer: "只核实国家图书馆官网，结论必须保留页面证据、发布日期和核实时间。",
    draftMustContain: ["国家图书馆", "2026", "国庆", "结论", "证据"],
  },
  {
    id: "bilibili-specific-episode",
    title: "B站具体集播放",
    initialInput: "打开哔哩哔哩上的《凡人修仙传》第120集并开始播放；必须核对标题确实是第120集，不要改播其他集。",
    intentProfile: "具体内容身份加可观察播放状态，不需要数据集合。",
    choiceRules: [],
    freeTextRules: [],
    fallbackAnswer: "目标固定为《凡人修仙传》第120集，核对身份后开始播放，不接受替代集数。",
    draftMustContain: ["凡人修仙传", "120", "播放", "核对"],
  },
  {
    id: "bilibili-latest-seek",
    title: "B站最新集定位180秒",
    initialInput: "在哔哩哔哩搜索《凡人修仙传》，播放当前最新正片并定位到3分钟；先核实哪一集是最新，不能用预告或剪辑。",
    intentProfile: "核实最新正片是执行步骤，最终结果是正确视频播放并到180秒。",
    choiceRules: [],
    freeTextRules: [],
    fallbackAnswer: "最新指官方正片的最高已更新集数，排除预告、花絮和剪辑；最终播放位置为180秒。",
    draftMustContain: ["凡人修仙传", "最新", "正片", "180", "播放"],
  },
  {
    id: "content-reading-location",
    title: "内容阅读定位",
    initialInput: "打开 MDN 的 AbortSignal.any 文档，定位到浏览器兼容性部分，并告诉我 Chrome 和 Firefox 首次支持的版本；保留页面链接。",
    intentProfile: "页面定位与事实读取组合，来源限定为MDN。",
    choiceRules: [{ promptIncludes: ["结果", "文档", "来源", "范围"], preferredOptionIncludes: ["指定文档", "指定页面", "官方文档"] }],
    freeTextRules: [
      { promptIncludes: ["文档", "页面", "名称", "链接"], answer: "MDN 的 AbortSignal.any 文档，不需要我提供 URL，由系统现场找到对应官方页面。" },
      { promptIncludes: ["浏览器", "兼容", "字段", "结果"], answer: "读取 Chrome 和 Firefox 的首次支持版本，并保留页面链接。" },
    ],
    fallbackAnswer: "只采用 MDN 的 AbortSignal.any 页面，定位兼容性部分并读取 Chrome、Firefox 首次支持版本，保留页面链接。",
    draftMustContain: ["MDN", "AbortSignal.any", "兼容", "Chrome", "Firefox"],
  },
  {
    id: "reservation-no-execution",
    title: "预约表单但采访阶段不执行",
    initialInput: "帮我预约一个羽毛球场，但我还没告诉你场馆范围。",
    intentProfile: "预约受理是最终结果；采访只形成需求，最终提交有独立确认门。",
    choiceRules: [
      { promptIncludes: ["场馆", "地点", "范围"], preferredOptionIncludes: ["指定区域", "按区域", "附近"] },
      { promptIncludes: ["流程", "阶段"], preferredOptionIncludes: ["填写预约信息，提交前停止"] },
      { promptIncludes: ["时段", "没有可订"], preferredOptionIncludes: ["仅预约完全符合条件的场地"],
        followUp: "保持原日期、时段和区域，不擅自更改；若没有完全符合条件的场地就停止并报告无匹配及候选信息，不自动预约替代场地，也不扩大费用。" },
    ],
    freeTextRules: [
      { promptIncludes: ["场馆", "地点", "区域", "范围"], answer: "人民广场地铁站步行20分钟内；具体场馆由系统后续调查。" },
      { promptIncludes: ["日期", "时间", "人数"], answer: "2026年9月12日（周六，Asia/Shanghai）15:00到16:00，两个人。" },
      { promptIncludes: ["提交", "确认", "价格"], answer: "可以填写到提交前；实际提交前必须让我确认场馆和总价。" },
      { promptIncludes: ["费用", "预算", "价格"], answer: "不设预先预算上限；实际提交前必须向我展示场馆、单价和总价并让我确认。" },
      { promptIncludes: ["总价", "上限"], answer: "不设预先预算上限；实际提交前必须向我展示场馆、单价和总价并让我确认。" },
    ],
    fallbackAnswer: "两人，2026年9月12日（周六，Asia/Shanghai）15:00到16:00；人民广场步行20分钟内；不设预先预算上限，提交前确认场馆、单价和总价。",
    draftMustContain: ["2026", "9月12日", "15", "16", "两个人", "人民广场", "提交前"],
    correctionAfterFirstDraft: "只填写到提交前，停止并让我再次确认场馆和总价；其他要求不变。",
  },
  {
    id: "favorites-management-no-execution",
    title: "收藏管理但采访阶段不执行",
    initialInput: "把我哔哩哔哩收藏夹“稍后看课程”中标题含“TypeScript”的视频移动到“前端学习”；移动前列出匹配数量并让我确认，不删除视频。",
    intentProfile: "账号内资源状态变化，移动前需确认，不允许删除。",
    choiceRules: [],
    freeTextRules: [],
    fallbackAnswer: "只移动标题包含 TypeScript 的收藏，先报告匹配数量并确认，不删除任何视频。",
    draftMustContain: ["稍后看课程", "TypeScript", "前端学习", "确认", "不删除"],
  },
  {
    id: "bill-and-expense-mixed",
    title: "账单整理与报销提交混合",
    initialInput: "从公司报销系统整理我8月份的出租车电子发票，生成日期、金额、起终点和发票号清单，再创建一份报销申请；正式提交前让我核对总额和明细。",
    intentProfile: "同时包含结构化账单集合和事务受理，创建申请可以准备但正式提交需确认。",
    choiceRules: [],
    freeTextRules: [
      { promptIncludes: ["年份", "哪个年", "时间"], answer: "2026年8月。" },
      { promptIncludes: ["项目", "部门", "成本中心", "归属"],
        answer: "当前未指定报销项目、部门或成本中心；请把它保留为执行前需用户补充的必填信息，不得猜测，也不得因此直接提交。" },
      { promptIncludes: ["入口", "网址", "系统", "账号"],
        answer: "使用当前已登录的公司报销系统；具体入口由用户在执行前指认。fixture 不提供 URL、账号或凭据，请保留为执行前输入，不能编造。" },
    ],
    fallbackAnswer: "范围是2026年8月份出租车电子发票；先生成明细和总额，正式提交报销前必须再次确认；当前已登录的公司报销系统入口由用户在执行前指认。",
    draftMustContain: ["8月", "出租车", "日期", "金额", "发票号", "提交前"],
  },
  {
    id: "cross-turn-correction",
    title: "跨轮纠正范围与数量",
    initialInput: "采集知乎搜索“露营帐篷”的前100条回答，保留问题、作者、赞同数、发布时间和回答链接，按默认综合排序。",
    intentProfile: "先形成100条知乎范围，随后用户纠正为最近一年、前30条；旧数量不得残留。",
    choiceRules: [],
    freeTextRules: [],
    fallbackAnswer: "按知乎默认综合排序，不足目标数量时保留实际结果并说明。",
    draftMustContain: ["知乎", "露营帐篷", "100", "作者", "赞同数"],
    correctionAfterFirstDraft: "纠正一下：只要最近一年发布的前30条回答，其他字段和知乎默认综合排序保持不变。请更新整份草稿。",
    finalDraftMustContain: ["知乎", "最近一年", "30", "作者", "赞同数"],
  },
  {
    id: "delegated-recommendation",
    title: "用户委托系统推荐口径",
    initialInput: "帮我整理3条适合5岁孩子、从上海市区当天往返的徒步路线。路线和来源你决定，但要说明推荐依据、交通时间、里程、爬升和风险；信息不足就标注。",
    intentProfile: "用户明确委托系统选路线和来源；应提出可核验口径而不是反问完整名单。",
    choiceRules: [{ promptIncludes: ["交通", "时间", "上限", "往返"], preferredOptionIncludes: ["公共交通为主", "时间灵活"] }],
    freeTextRules: [],
    fallbackAnswer: "你决定路线与来源；纳入条件是5岁儿童可完成、上海市区当天往返，并保留交通、里程、爬升和风险依据。",
    draftMustContain: ["3", "5岁", "上海", "当天往返", "里程", "爬升", "风险"],
  },
  {
    id: "capture-and-media-composite",
    title: "采集与媒体控制复合任务",
    initialInput: "收集哔哩哔哩搜索“凡人修仙传”前20条结果的标题、UP主和发布时间，再播放第一条到3分钟；两个结果都要完成，不要让我删掉其中一个目标。",
    intentProfile: "保留20条结构化结果和第一条播放至180秒两个独立可验收结果。",
    choiceRules: [{ promptIncludes: ["排序", "前20", "第一条"], preferredOptionIncludes: ["默认综合排序"] }],
    freeTextRules: [],
    fallbackAnswer: "两个目标都保留：先按B站默认排序收集前20条，再播放结果中的第一条并定位180秒。",
    draftMustContain: ["20", "标题", "UP主", "发布时间", "第一条", "180"],
  },
]
