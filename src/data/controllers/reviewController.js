import { loadTransactions } from './transactionController.js'
import { loadBudgets } from './budgetController.js'
import { loadGoals } from './savingsGoalController.js'
import { TRANSACTION_TYPES, BUDGET_WARN_RATIO } from '../../core/constants.js'
import { calcPercent, compactMoney, shiftMonth, todayStr, monthLabel } from '../../core/utils.js'

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

function totalsOfMonth(month) {
  let income = 0
  let expense = 0
  for (const t of loadTransactions()) {
    if (!t.date.startsWith(month)) continue
    if (t.type === TRANSACTION_TYPES.INCOME) income += t.amount
    else if (t.type === TRANSACTION_TYPES.EXPENSE) expense += t.amount
  }
  return { income: round2(income), expense: round2(expense), balance: round2(income - expense) }
}

function expenseByCategoryOfMonth(month) {
  const map = new Map()
  for (const t of loadTransactions()) {
    if (t.type !== TRANSACTION_TYPES.EXPENSE || !t.date.startsWith(month)) continue
    map.set(t.category, round2((map.get(t.category) || 0) + t.amount))
  }
  return map
}

function changeText(delta) {
  const abs = compactMoney(Math.abs(delta))
  return delta > 0 ? `多支出 ${abs} 元` : delta < 0 ? `少支出 ${abs} 元` : '基本持平'
}

function changePct(curr, prev) {
  if (!prev || prev <= 0) return null
  return Math.round(((curr - prev) / prev) * 100)
}

// 超支 / 接近超支的预算类别
function budgetReview(month) {
  const usedMap = expenseByCategoryOfMonth(month)
  const items = loadBudgets()
    .filter((b) => b.month === month)
    .map((b) => {
      const used = usedMap.get(b.category) || 0
      const percent = calcPercent(used, b.limit)
      return {
        id: b.id,
        category: b.category,
        limit: b.limit,
        used: round2(used),
        over: round2(Math.max(0, used - b.limit)),
        remaining: round2(b.limit - used),
        percent,
        status: used > b.limit ? 'over' : used >= b.limit * BUDGET_WARN_RATIO ? 'near' : 'ok'
      }
    })
  return {
    over: items.filter((i) => i.status === 'over').sort((a, b) => b.over - a.over),
    near: items.filter((i) => i.status === 'near').sort((a, b) => b.percent - a.percent),
    count: items.length
  }
}

// 环比：收支结余总额 + 各类别支出变化
function compareReview(month) {
  const prevMonth = shiftMonth(month, -1)
  const cur = totalsOfMonth(month)
  const prev = totalsOfMonth(prevMonth)
  const curMap = expenseByCategoryOfMonth(month)
  const prevMap = expenseByCategoryOfMonth(prevMonth)
  const categories = [...new Set([...curMap.keys(), ...prevMap.keys()])]
    .map((category) => {
      const current = curMap.get(category) || 0
      const previous = prevMap.get(category) || 0
      return { category, current: round2(current), previous: round2(previous), delta: round2(current - previous) }
    })
    .sort((a, b) => b.delta - a.delta)
  const prevHasData = prev.income > 0 || prev.expense > 0
  return {
    prevMonth,
    prevHasData,
    current: cur,
    previous: prev,
    incomeDelta: round2(cur.income - prev.income),
    expenseDelta: round2(cur.expense - prev.expense),
    balanceDelta: round2(cur.balance - prev.balance),
    expensePct: changePct(cur.expense, prev.expense),
    incomePct: changePct(cur.income, prev.income),
    topUp: categories.filter((c) => c.delta > 0).slice(0, 3),
    topDown: categories.filter((c) => c.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 3)
  }
}

// 储蓄目标进度（含按剩余天数折算的每月需存金额）
function goalsReview() {
  const today = todayStr()
  const goals = loadGoals().map((g) => {
    const leftDays = g.targetDate
      ? Math.max(0, Math.ceil((new Date(`${g.targetDate}T23:59:59`) - new Date(`${today}T00:00:00`)) / 86400000))
      : null
    const monthsLeft = leftDays == null ? null : Math.max(1, Math.round(leftDays / 30))
    const remainingAmount = round2(Math.max(0, g.targetAmount - g.savedAmount))
    const percent = calcPercent(g.savedAmount, g.targetAmount)
    return {
      ...g,
      percent,
      leftDays,
      remainingAmount,
      monthlyNeeded: leftDays === 0 ? remainingAmount : monthsLeft ? round2(remainingAmount / monthsLeft) : 0,
      status: percent >= 100 ? 'done' : leftDays === 0 ? 'overdue' : 'active'
    }
  })
  const active = goals.filter((g) => g.status !== 'done')
  const urgent = [...active].sort((a, b) => {
    // 越临近截止、缺口越大越紧急
    const score = (g) => (g.leftDays == null ? Number.MAX_SAFE_INTEGER : g.remainingAmount / Math.max(1, g.leftDays))
    return score(b) - score(a)
  })
  return { goals, active, urgent: urgent[0] || null }
}

function buildSummary(cur, savingsRate) {
  const label = '收支总结'
  if (cur.balance > 0) {
    return {
      label,
      tone: 'good',
      text: `本月收入 ${compactMoney(cur.income)} 元、支出 ${compactMoney(cur.expense)} 元，结余 ${compactMoney(cur.balance)} 元，储蓄率约 ${savingsRate}%，财务状况健康。`
    }
  }
  if (cur.balance === 0) {
    return {
      label,
      tone: 'plain',
      text: `本月收入 ${compactMoney(cur.income)} 元、支出 ${compactMoney(cur.expense)} 元，收支刚好相抵，没有留下结余。`
    }
  }
  return {
    label,
    tone: 'bad',
    text: `本月收入 ${compactMoney(cur.income)} 元、支出 ${compactMoney(cur.expense)} 元，出现 ${compactMoney(Math.abs(cur.balance))} 元赤字，支出已经超过收入。`
  }
}

function buildBudgetParagraph(budget, expense) {
  if (expense <= 0) {
    return { label: '超支类别', tone: 'plain', text: '本月没有支出记录，预算使用情况暂无法评估。' }
  }
  if (budget.count === 0) {
    return { label: '超支类别', tone: 'plain', text: '本月还没有为任何支出类别设置预算，建议先到「月度预算」设定上限。' }
  }
  if (budget.over.length === 0) {
    const nearText = budget.near.length
      ? `其中「${budget.near.slice(0, 2).map((i) => i.category).join('」「')}」已接近预算上限，需要留意。`
      : '各类别支出均在预算范围内。'
    return { label: '超支类别', tone: 'good', text: `本月没有类别超支。${nearText}` }
  }
  const top = budget.over.slice(0, 3)
  const detail = top.map((i) => `「${i.category}」超 ${compactMoney(i.over)} 元（已用 ${i.percent}%）`).join('，')
  const extra = budget.over.length > top.length ? `，另有 ${budget.over.length - top.length} 个类别超支` : ''
  return {
    label: '超支类别',
    tone: 'bad',
    text: `本月共有 ${budget.over.length} 个类别超出预算：${detail}${extra}，是本月需要重点复盘的支出。`
  }
}

function buildCompareParagraph(comp) {
  if (!comp.prevHasData) {
    return { label: '环比上月', tone: 'plain', text: '上月没有记账记录，环比变化暂无法计算，坚持记账后即可看到趋势。' }
  }
  const parts = []
  const expPctText = comp.expensePct == null ? '' : `（${comp.expensePct > 0 ? '+' : ''}${comp.expensePct}%）`
  parts.push(`支出较上月${changeText(comp.expenseDelta)}${expPctText}`)
  if (comp.previous.income > 0 || comp.current.income > 0) {
    const incPctText = comp.incomePct == null ? '' : `（${comp.incomePct > 0 ? '+' : ''}${comp.incomePct}%）`
    parts.push(`收入${comp.incomeDelta >= 0 ? '增加' : '减少'} ${compactMoney(Math.abs(comp.incomeDelta))} 元${incPctText}`)
  }
  let tail = ''
  if (comp.balanceDelta > 0) tail = `，结余比上月多存 ${compactMoney(comp.balanceDelta)} 元，趋势向好。`
  else if (comp.balanceDelta < 0) tail = `，结余比上月少 ${compactMoney(Math.abs(comp.balanceDelta))} 元，需要关注。`
  else tail = '，结余与上月基本持平。'
  let categoryHint = ''
  if (comp.topUp.length > 0 && comp.expenseDelta > 0) {
    categoryHint = `支出增加主要来自「${comp.topUp.slice(0, 2).map((c) => c.category).join('」「')}」。`
  } else if (comp.expenseDelta < 0 && comp.topDown.length > 0) {
    categoryHint = `支出下降主要是「${comp.topDown.slice(0, 2).map((c) => c.category).join('」「')}」省下的。`
  }
  const tone = comp.expenseDelta < 0 && comp.balanceDelta >= 0 ? 'good' : comp.expenseDelta > 0 ? 'warn' : 'plain'
  return { label: '环比上月', tone, text: `${parts.join('，')}${tail}${categoryHint}` }
}

function buildSavingsParagraph(goals, cur) {
  if (goals.goals.length === 0) {
    return {
      label: '储蓄进度',
      tone: cur.balance > 0 ? 'good' : 'plain',
      text: cur.balance > 0
        ? `本月结余 ${compactMoney(cur.balance)} 元，还没有设置储蓄目标，可以到「储蓄目标」建立第一个目标。`
        : '本月还没有储蓄目标，建议先设定一个可量化的存钱目标。'
    }
  }
  const doneCount = goals.goals.length - goals.active.length
  const doneText = doneCount > 0 ? `已完成 ${doneCount} 个目标；` : ''
  const u = goals.urgent
  if (!u) {
    return { label: '储蓄进度', tone: 'good', text: `${doneText}全部储蓄目标均已达成，继续保持。` }
  }
  let dateText = '未设置截止日期'
  if (u.leftDays === 0) dateText = '已到截止日期'
  else dateText = `距截止还有 ${u.leftDays} 天`
  return {
    label: '储蓄进度',
    tone: u.status === 'overdue' ? 'bad' : 'plain',
    text: `${doneText}最需要关注的是「${u.name}」：已存 ${u.percent}%，还差 ${compactMoney(u.remainingAmount)} 元，${dateText}，平均每月需存约 ${compactMoney(u.monthlyNeeded)} 元。`
  }
}

// 根据数据生成简短可执行建议（最多 4 条）
function buildAdvices({ cur, budget, comp, goals, savingsRate }) {
  const advices = []
  if (cur.balance < 0) {
    advices.push('本月入不敷出，建议先压缩弹性支出（娱乐、购物等），让支出回到收入以内。')
  } else if (savingsRate >= 0 && savingsRate < 20 && cur.income > 0) {
    advices.push(`本月储蓄率约 ${savingsRate}%，建议向 30% 靠拢，发工资后先转存一笔再安排消费。`)
  }
  if (budget.over.length > 0) {
    const top = budget.over[0]
    advices.push(`「${top.category}」超支 ${compactMoney(top.over)} 元，下月建议将该类预算上调或设置消费提醒。`)
  } else if (budget.count === 0 && cur.expense > 0) {
    advices.push('本月还没有设置任何预算，建议为餐饮、购物等高频类别设定月度上限。')
  } else if (budget.near.length > 0) {
    advices.push(`「${budget.near[0].category}」预算已用 ${budget.near[0].percent}%，剩余日子注意控制该类消费。`)
  }
  if (comp.prevHasData && comp.expenseDelta > 0 && comp.expensePct != null && comp.expensePct >= 20) {
    const cats = comp.topUp.slice(0, 2).map((c) => `「${c.category}」`).join('')
    advices.push(`支出环比上涨 ${comp.expensePct}%，增长集中在${cats}，建议核对是否为一次性支出。`)
  }
  const u = goals.urgent
  if (u && u.status === 'active' && cur.balance > 0) {
    if (cur.balance < u.monthlyNeeded) {
      advices.push(`按当前进度，「${u.name}」每月需存约 ${compactMoney(u.monthlyNeeded)} 元，高于本月结余，需提高储蓄或调整目标期限。`)
    } else {
      advices.push(`本月结余可覆盖「${u.name}」所需月存金额，建议尽快把这笔钱转入专用账户。`)
    }
  }
  if (advices.length === 0) {
    advices.push(cur.balance >= 0
      ? '本月收支健康，继续保持记账习惯，把结余稳定地存入储蓄目标。'
      : '先从记录每一笔支出开始，摸清钱花在了哪里。')
  }
  return advices.slice(0, 4)
}

export function monthlyReview(month) {
  const cur = totalsOfMonth(month)
  const hasData = loadTransactions().some(
    (t) => t.date.startsWith(month) && t.type !== TRANSACTION_TYPES.TRANSFER
  )
  if (!hasData) {
    return {
      month,
      monthLabelText: monthLabel(month),
      hasData: false,
      cur,
      savingsRate: 0
    }
  }
  const budget = budgetReview(month)
  const compare = compareReview(month)
  const goals = goalsReview()
  const savingsRate = cur.income > 0 ? Math.round((cur.balance / cur.income) * 100) : 0
  const ctx = { cur, budget, comp: compare, goals, savingsRate }
  return {
    month,
    monthLabelText: monthLabel(month),
    hasData: true,
    cur,
    savingsRate,
    budget,
    compare,
    goals,
    paragraphs: [
      buildSummary(cur, savingsRate),
      buildBudgetParagraph(budget, cur.expense),
      buildCompareParagraph(compare),
      buildSavingsParagraph(goals, cur)
    ],
    advices: buildAdvices(ctx)
  }
}

// 有记账数据的最近月份（用于空态时引导跳转）
export function latestRecordedMonth() {
  const months = loadTransactions()
    .filter((t) => t.type !== TRANSACTION_TYPES.TRANSFER)
    .map((t) => t.date.slice(0, 7))
    .sort()
  return months.length ? months[months.length - 1] : null
}
