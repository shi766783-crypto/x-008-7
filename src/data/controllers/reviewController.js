import { TRANSACTION_TYPES } from '../../core/constants.js'
import { monthLabel, money, calcPercent } from '../../core/utils.js'
import { loadTransactions } from './transactionController.js'
import { incomeAndExpense, expenseByCategory, savingsRate } from './reportController.js'
import { budgetView, goalViews } from './statController.js'

export function prevMonthStr(month) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function buildDelta(cur, prev) {
  return { diff: cur - prev, pct: prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null }
}

function comparePhrase(label, cur, prev) {
  const diff = cur - prev
  if (prev <= 0) return cur > 0 ? `${label}上月为 0，本月为 ¥${money(cur)}` : `${label}与上月持平`
  if (Math.abs(diff) < 0.005) return `${label}与上月持平`
  const pct = Math.round((Math.abs(diff) / prev) * 100)
  return `${label}较上月${diff > 0 ? '增加' : '减少'} ¥${money(Math.abs(diff))}（${pct}%）`
}

function biggestExpenseIncrease(month, prevMonth) {
  const prev = new Map(expenseByCategory(prevMonth).map((r) => [r.category, r.amount]))
  let best = null
  for (const { category, amount } of expenseByCategory(month)) {
    const diff = amount - (prev.get(category) || 0)
    if (diff > 0 && (!best || diff > best.diff)) best = { category, diff }
  }
  return best
}

function buildConclusion(ctx) {
  const label = monthLabel(ctx.month)
  const parts = []
  if (ctx.balance >= 0) {
    parts.push(`${label}总收入 ¥${money(ctx.income)}，总支出 ¥${money(ctx.expense)}，结余 ¥${money(ctx.balance)}，储蓄率 ${ctx.savingsRate}%。`)
  } else {
    parts.push(`${label}总收入 ¥${money(ctx.income)}，总支出 ¥${money(ctx.expense)}，入不敷出 ¥${money(Math.abs(ctx.balance))}，需要引起重视。`)
  }
  if (ctx.prev.hasData) {
    parts.push(`${comparePhrase('支出', ctx.expense, ctx.prev.expense)}，${comparePhrase('收入', ctx.income, ctx.prev.income)}。`)
  } else {
    parts.push('上月没有记账数据，暂无法环比。')
  }
  if (ctx.overspent.length > 0) {
    const names = ctx.overspent.map((o) => `「${o.category}」`).join('、')
    const totalOver = ctx.overspent.reduce((s, o) => s + o.over, 0)
    parts.push(`${names}超出预算，合计超支 ¥${money(totalOver)}。`)
  } else if (ctx.budgetsCount > 0) {
    parts.push('各预算类别均在限额内，执行良好。')
  } else {
    parts.push('本月未设置分类预算，支出缺少参照。')
  }
  if (ctx.goalsSummary) {
    parts.push(`储蓄目标共 ${ctx.goals.length} 个，整体进度 ${ctx.goalsSummary.percent}%（已存 ¥${money(ctx.goalsSummary.totalSaved)} / 目标 ¥${money(ctx.goalsSummary.totalTarget)}）。`)
  } else {
    parts.push('尚未设立储蓄目标。')
  }
  return parts.join('')
}

function buildSuggestions(ctx) {
  const list = []
  if (ctx.balance < 0) {
    list.push('本月入不敷出，建议先盘点大额支出，压缩非必要开销。')
  }
  if (ctx.overspent.length > 0) {
    const top = ctx.overspent[0]
    list.push(`「${top.category}」超支最多（¥${money(top.over)}），下月重点控制该类别开支，或评估预算是否定得过低。`)
  }
  if (ctx.topIncrease) {
    list.push(`「${ctx.topIncrease.category}」支出环比增加 ¥${money(ctx.topIncrease.diff)}，是增长最多的类别，建议复盘原因。`)
  }
  if (ctx.income > 0 && ctx.savingsRate < 10) {
    list.push('储蓄率不足 10%，建议发薪后先按比例强制储蓄，再安排日常消费。')
  } else if (ctx.savingsRate >= 30) {
    list.push('储蓄率超过 30%，保持得当，可将部分结余提前存入储蓄目标。')
  }
  if (ctx.budgetsCount === 0) {
    list.push('去「月度预算」为各支出类别设定上限，下月复盘就能看到预算执行情况。')
  }
  const nextGoal = ctx.goals.find((g) => g.status === 'active')
  if (nextGoal) {
    list.push(`「${nextGoal.name}」还差 ¥${money(nextGoal.remainingAmount)}，按计划每月存 ¥${money(nextGoal.monthlyAmount)} 可如期达成。`)
  }
  if (list.length === 0) {
    list.push('本月财务状况平稳，继续保持记账习惯。')
  }
  return list.slice(0, 4)
}

export function monthlyReview(month) {
  const prevMonth = prevMonthStr(month)
  const hasData = loadTransactions().some((t) => t.type !== TRANSACTION_TYPES.TRANSFER && t.date.startsWith(month))
  if (!hasData) return { month, prevMonth, hasData: false }

  const { income, expense, balance } = incomeAndExpense(month)
  const prev = incomeAndExpense(prevMonth)
  const prevHasData = loadTransactions().some((t) => t.type !== TRANSACTION_TYPES.TRANSFER && t.date.startsWith(prevMonth))
  const rate = savingsRate(income, expense)
  const prevRate = savingsRate(prev.income, prev.expense)

  const budgets = budgetView(month)
  const overspent = budgets
    .filter((b) => b.status === 'danger')
    .map((b) => ({ category: b.category, limit: b.limit, used: b.used, percent: b.percent, over: b.used - b.limit }))
    .sort((a, b) => b.over - a.over)

  const goals = goalViews()
  const goalsSummary = goals.length
    ? {
        totalTarget: goals.reduce((s, g) => s + g.targetAmount, 0),
        totalSaved: goals.reduce((s, g) => s + g.savedAmount, 0),
        percent: calcPercent(
          goals.reduce((s, g) => s + g.savedAmount, 0),
          goals.reduce((s, g) => s + g.targetAmount, 0)
        )
      }
    : null

  const ctx = {
    month,
    prevMonth,
    hasData: true,
    income,
    expense,
    balance,
    savingsRate: rate,
    prev: { month: prevMonth, hasData: prevHasData, ...prev },
    mom: {
      income: buildDelta(income, prev.income),
      expense: buildDelta(expense, prev.expense),
      balance: buildDelta(balance, prev.balance),
      rate: { diff: rate - prevRate }
    },
    overspent,
    budgetsCount: budgets.length,
    topCategories: expenseByCategory(month).slice(0, 3),
    goals,
    goalsSummary,
    topIncrease: prevHasData ? biggestExpenseIncrease(month, prevMonth) : null
  }
  ctx.conclusion = buildConclusion(ctx)
  ctx.suggestions = buildSuggestions(ctx)
  return ctx
}
