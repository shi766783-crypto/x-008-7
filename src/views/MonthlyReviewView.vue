<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2>月度复盘</h2>
        <p class="page-sub">一页看懂当月收支结余、超支类别、环比变化与储蓄进度</p>
      </div>
      <div class="month-switcher card">
        <button class="month-btn" @click="changeMonth(-1)" aria-label="上一月">‹</button>
        <span class="month-text">{{ monthLabel(month) }}</span>
        <button class="month-btn" :disabled="month >= currentMonth" @click="changeMonth(1)" aria-label="下一月">›</button>
      </div>
    </div>

    <template v-if="review.hasData">
      <div class="kpis">
        <div class="card kpi">
          <span class="kpi-label">本月收入</span>
          <b class="kpi-value income">¥{{ money(review.cur.income) }}</b>
        </div>
        <div class="card kpi">
          <span class="kpi-label">本月支出</span>
          <b class="kpi-value expense">¥{{ money(review.cur.expense) }}</b>
        </div>
        <div class="card kpi">
          <span class="kpi-label">本月结余</span>
          <b class="kpi-value" :class="{ neg: review.cur.balance < 0, income: review.cur.balance > 0 }">
            {{ review.cur.balance < 0 ? '-' : '' }}¥{{ money(Math.abs(review.cur.balance)) }}
          </b>
        </div>
        <div class="card kpi">
          <span class="kpi-label">储蓄率</span>
          <b class="kpi-value accent">{{ review.savingsRate }}%</b>
        </div>
      </div>

      <div class="card conclusion">
        <h3 class="card-title">📝 本月结论</h3>
        <p v-for="(p, i) in review.paragraphs" :key="i" class="conclusion-line">
          <span class="conclusion-tag" :class="p.tone">{{ p.label }}</span>
          <span class="conclusion-text">{{ p.text }}</span>
        </p>
      </div>

      <div class="detail-grid">
        <div class="card detail-card">
          <h3 class="card-title">⚠️ 超支类别</h3>
          <div v-if="review.budget.count === 0" class="inline-empty">
            本月还没有设置预算，可到「月度预算」为各类别设定上限。
          </div>
          <div v-else-if="review.budget.over.length === 0 && review.budget.near.length === 0" class="inline-empty good">
            ✅ 所有已设预算的类别都在健康范围内。
          </div>
          <ul v-else class="budget-rows">
            <li v-for="item in review.budget.over" :key="item.id" class="budget-row">
              <div class="budget-row-head">
                <span class="budget-cat">{{ item.category }}</span>
                <span class="badge danger">超支 ¥{{ money(item.over) }}</span>
              </div>
              <div class="bar-track">
                <div class="bar danger" :style="{ width: Math.min(100, item.percent) + '%' }"></div>
              </div>
              <div class="budget-meta">已用 ¥{{ money(item.used) }} / 预算 ¥{{ money(item.limit) }}（{{ item.percent }}%）</div>
            </li>
            <li v-for="item in review.budget.near" :key="item.id" class="budget-row">
              <div class="budget-row-head">
                <span class="budget-cat">{{ item.category }}</span>
                <span class="badge warn">已用 {{ item.percent }}%</span>
              </div>
              <div class="bar-track">
                <div class="bar warn" :style="{ width: Math.min(100, item.percent) + '%' }"></div>
              </div>
              <div class="budget-meta">剩余 ¥{{ money(item.remaining) }}，接近预算上限</div>
            </li>
          </ul>
        </div>

        <div class="card detail-card">
          <h3 class="card-title">📈 环比上月</h3>
          <div v-if="!review.compare.prevHasData" class="inline-empty">
            上月（{{ monthLabel(review.compare.prevMonth) }}）没有记账记录，环比暂无法计算。
          </div>
          <template v-else>
            <div class="compare-row">
              <span class="compare-label">收入</span>
              <span class="compare-val" :class="deltaClass(review.compare.incomeDelta)">
                {{ signedMoney(review.compare.incomeDelta) }}
                <em v-if="review.compare.incomePct != null">（{{ signedPct(review.compare.incomePct) }}）</em>
              </span>
            </div>
            <div class="compare-row">
              <span class="compare-label">支出</span>
              <span class="compare-val" :class="expenseDeltaClass(review.compare.expenseDelta)">
                {{ signedMoney(review.compare.expenseDelta) }}
                <em v-if="review.compare.expensePct != null">（{{ signedPct(review.compare.expensePct) }}）</em>
              </span>
            </div>
            <div class="compare-row">
              <span class="compare-label">结余</span>
              <span class="compare-val" :class="deltaClass(review.compare.balanceDelta)">
                {{ signedMoney(review.compare.balanceDelta) }}
              </span>
            </div>
            <div v-if="review.compare.topUp.length" class="compare-cats">
              <div class="compare-cats-title">支出增加最多</div>
              <div v-for="c in review.compare.topUp" :key="c.category" class="compare-cat">
                <span>{{ c.category }}</span>
                <span class="neg">+¥{{ money(c.delta) }}</span>
              </div>
            </div>
          </template>
        </div>
      </div>

      <div class="card detail-card goals-card">
        <h3 class="card-title">🎯 储蓄进度</h3>
        <div v-if="review.goals.goals.length === 0" class="inline-empty">
          还没有储蓄目标，可到「储蓄目标」建立第一个存钱计划。
        </div>
        <ul v-else class="goal-rows">
          <li v-for="g in review.goals.goals" :key="g.id" class="goal-row" :class="{ urgent: g.id === review.goals.urgent?.id }">
            <div class="goal-head">
              <span class="goal-name">
                {{ g.name }}
                <span v-if="g.id === review.goals.urgent?.id" class="badge danger">最紧急</span>
                <span v-else-if="g.status === 'done'" class="badge done">已完成</span>
                <span v-else-if="g.status === 'overdue'" class="badge danger">已逾期</span>
              </span>
              <span class="goal-nums">¥{{ money(g.savedAmount) }} / ¥{{ money(g.targetAmount) }}（{{ g.percent }}%）</span>
            </div>
            <div class="bar-track">
              <div class="bar ok" :style="{ width: Math.min(100, g.percent) + '%' }"></div>
            </div>
            <div class="goal-meta">
              <template v-if="g.status === 'done'">目标已达成 🎉</template>
              <template v-else-if="g.leftDays === 0">已到截止日期，还差 ¥{{ money(g.remainingAmount) }}</template>
              <template v-else>
                距截止还有 {{ g.leftDays }} 天，还差 ¥{{ money(g.remainingAmount) }}，平均每月需存约 ¥{{ money(g.monthlyNeeded) }}
              </template>
            </div>
          </li>
        </ul>
      </div>

      <div class="card advice-card">
        <h3 class="card-title">💡 下月建议</h3>
        <ul class="advice-list">
          <li v-for="(advice, i) in review.advices" :key="i">{{ advice }}</li>
        </ul>
      </div>
    </template>

    <div v-else class="card empty empty-state">
      <div class="empty-icon">🗒️</div>
      <p class="empty-title">{{ monthLabel(month) }}还没有记账数据</p>
      <p class="empty-desc">
        这个月没有任何收入或支出记录，暂时无法生成复盘。<br />
        去「记账」页面记一笔，月末再来看看本月的收支总结吧。
      </p>
      <button v-if="latestMonth && latestMonth !== month" class="btn btn-primary" @click="month = latestMonth">
        查看 {{ monthLabel(latestMonth) }} 的复盘
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useStore, controllersApi } from '../data/store.js'
import { money, monthLabel, shiftMonth } from '../core/utils.js'

const store = useStore()

const currentMonth = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
})()

const month = ref(currentMonth)

const review = computed(() => {
  // 依赖 store 中的数据，记账 / 预算 / 目标变更后自动重算
  void store.transactions
  void store.budgets
  void store.goals
  return controllersApi.review.monthlyReview(month.value)
})

const latestMonth = computed(() => {
  void store.transactions
  return controllersApi.review.latestRecordedMonth()
})

const changeMonth = (delta) => {
  const next = shiftMonth(month.value, delta)
  if (next > currentMonth) return
  month.value = next
}

const signedMoney = (v) => `${v >= 0 ? '+' : '-'}¥${money(Math.abs(v))}`
const signedPct = (v) => `${v >= 0 ? '+' : ''}${v}%`
const deltaClass = (v) => (v > 0 ? 'income' : v < 0 ? 'neg' : 'muted')
const expenseDeltaClass = (v) => (v < 0 ? 'income' : v > 0 ? 'neg' : 'muted')
</script>

<style scoped>
.month-switcher {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
}
.month-btn {
  border: none;
  background: var(--bg-elevated);
  color: var(--text-primary);
  width: 30px;
  height: 30px;
  border-radius: 8px;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.month-btn:hover:not(:disabled) { background: rgba(79, 141, 249, 0.14); color: var(--accent); }
.month-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.month-text {
  min-width: 96px;
  text-align: center;
  font-weight: 700;
  font-size: 14px;
}

.kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}
@media (max-width: 720px) {
  .kpis { grid-template-columns: repeat(2, 1fr); }
}
.kpi {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.kpi-label { font-size: 12px; color: var(--text-secondary); }
.kpi-value { font-size: 24px; font-weight: 800; }
.kpi-value.income { color: var(--income); }
.kpi-value.expense, .kpi-value.neg { color: var(--expense); }
.kpi-value.accent { color: var(--accent); }

.card-title { margin: 0 0 12px; font-size: 15px; }

.conclusion { margin-bottom: 16px; }
.conclusion-line {
  margin: 0 0 10px;
  display: flex;
  gap: 10px;
  align-items: flex-start;
  line-height: 1.7;
}
.conclusion-line:last-child { margin-bottom: 0; }
.conclusion-tag {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
  font-style: normal;
  padding: 2px 10px;
  border-radius: 999px;
  margin-top: 3px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
}
.conclusion-tag.good { background: rgba(87, 199, 133, 0.15); color: var(--income); }
.conclusion-tag.bad { background: rgba(244, 91, 105, 0.13); color: var(--expense); }
.conclusion-tag.warn { background: rgba(240, 201, 87, 0.18); color: #b8860b; }
.conclusion-text { color: var(--text-primary); }

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
}
@media (max-width: 860px) {
  .detail-grid { grid-template-columns: 1fr; }
}
.detail-card { margin-bottom: 0; }
.goals-card { margin-bottom: 16px; }

.inline-empty {
  color: var(--text-secondary);
  font-size: 13px;
  padding: 12px 4px;
}
.inline-empty.good { color: var(--income); }

.budget-rows,
.goal-rows,
.advice-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.budget-row { margin-bottom: 14px; }
.budget-row:last-child { margin-bottom: 0; }
.budget-row-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.budget-cat,
.goal-name { font-weight: 700; font-size: 14px; }
.budget-meta,
.goal-meta {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 5px;
}
.bar-track {
  height: 10px;
  background: var(--bg-elevated);
  border-radius: 999px;
  overflow: hidden;
}
.bar { height: 100%; border-radius: 999px; transition: width 0.3s ease; }
.bar.ok { background: linear-gradient(90deg, #57c785, #3aa66f); }
.bar.warn { background: linear-gradient(90deg, #f0c957, #e0a41f); }
.bar.danger { background: linear-gradient(90deg, #f45b69, #d63a4a); }

.compare-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px dashed var(--border-color);
}
.compare-row:last-child { border-bottom: none; }
.compare-label { color: var(--text-secondary); font-size: 13px; }
.compare-val { font-weight: 700; font-size: 14px; }
.compare-val em { font-style: normal; font-weight: 500; font-size: 12px; color: var(--text-secondary); }
.compare-val.income { color: var(--income); }
.compare-val.neg { color: var(--expense); }
.compare-val.muted { color: var(--text-secondary); font-weight: 500; }
.compare-cats { margin-top: 12px; }
.compare-cats-title {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.compare-cat {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  padding: 4px 0;
}

.goal-row {
  padding: 10px 12px;
  border-radius: 12px;
  margin-bottom: 10px;
  background: var(--bg-body);
}
.goal-row:last-child { margin-bottom: 0; }
.goal-row.urgent { background: rgba(244, 91, 105, 0.06); }
.goal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.goal-nums { font-size: 12px; color: var(--text-secondary); }

.advice-card { background: linear-gradient(180deg, #ffffff, #f8faff); }
.advice-list li {
  position: relative;
  padding-left: 22px;
  margin-bottom: 10px;
  line-height: 1.7;
  font-size: 14px;
}
.advice-list li:last-child { margin-bottom: 0; }
.advice-list li::before {
  content: '✦';
  position: absolute;
  left: 0;
  top: 0;
  color: var(--accent);
  font-size: 13px;
}

.empty-state { padding: 56px 20px; }
.empty-icon { font-size: 44px; margin-bottom: 12px; }
.empty-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 8px;
}
.empty-desc {
  margin: 0 0 20px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.8;
}
</style>
