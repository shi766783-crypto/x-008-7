<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2>月度复盘</h2>
        <p class="page-sub">每月一份看得懂的财务总结</p>
      </div>
      <div class="month-nav">
        <button class="btn nav-btn" @click="shiftMonth(-1)">← 上月</button>
        <input v-model="month" type="month" class="month-input" :max="maxMonth" />
        <button class="btn nav-btn" @click="shiftMonth(1)" :disabled="month >= maxMonth">下月 →</button>
      </div>
    </div>

    <div v-if="!review.hasData" class="card empty">
      <div class="empty-icon">🗓️</div>
      <p class="empty-title">{{ monthLabel(month) }} 还没有记账数据</p>
      <p class="muted">去「记账」页面记下收支后，这里会自动生成该月的复盘总结。</p>
    </div>

    <template v-else>
      <div class="card conclusion-card">
        <h3 class="card-title">📋 {{ monthLabel(month) }}总结</h3>
        <p class="conclusion-text">{{ review.conclusion }}</p>
      </div>

      <div class="card advice-card">
        <h3 class="card-title">💡 下月建议</h3>
        <ul class="advice-list">
          <li v-for="(s, i) in review.suggestions" :key="i">{{ s }}</li>
        </ul>
      </div>

      <div class="kpis">
        <div class="card kpi">
          <span class="kpi-label">总收入</span>
          <b class="kpi-value income">¥{{ money(review.income) }}</b>
          <span class="mom" :class="momClass('income')">{{ momText('income') }}</span>
        </div>
        <div class="card kpi">
          <span class="kpi-label">总支出</span>
          <b class="kpi-value expense">¥{{ money(review.expense) }}</b>
          <span class="mom" :class="momClass('expense', true)">{{ momText('expense') }}</span>
        </div>
        <div class="card kpi">
          <span class="kpi-label">结余</span>
          <b class="kpi-value" :class="{ neg: review.balance < 0 }">¥{{ money(review.balance) }}</b>
          <span class="mom" :class="momClass('balance')">{{ momText('balance') }}</span>
        </div>
        <div class="card kpi">
          <span class="kpi-label">储蓄率</span>
          <b class="kpi-value accent">{{ review.savingsRate }}%</b>
          <span class="mom" :class="rateMomClass">{{ rateMomText }}</span>
        </div>
      </div>

      <div class="two-col">
        <div class="card">
          <h3 class="card-title">超支类别</h3>
          <template v-if="review.overspent.length">
            <div v-for="o in review.overspent" :key="o.category" class="over-row">
              <div class="over-head">
                <span class="over-cat">{{ o.category }}</span>
                <span class="over-nums">
                  ¥{{ money(o.used) }} / ¥{{ money(o.limit) }}
                  <em>超 ¥{{ money(o.over) }}</em>
                </span>
              </div>
              <div class="bar-track">
                <div class="bar danger" :style="{ width: Math.min(100, o.percent) + '%' }"></div>
              </div>
            </div>
          </template>
          <p v-else-if="review.budgetsCount" class="ok-text">✅ 各类别支出均在预算内，没有超支。</p>
          <p v-else class="muted">本月未设置分类预算，无法评估超支情况。</p>
        </div>

        <div class="card">
          <h3 class="card-title">储蓄进度</h3>
          <template v-if="review.goalsSummary">
            <div class="goal-total">
              <span>整体进度</span>
              <div class="bar-track total-track">
                <div class="bar ok" :style="{ width: Math.min(100, review.goalsSummary.percent) + '%' }"></div>
              </div>
              <b>{{ review.goalsSummary.percent }}%</b>
            </div>
            <div v-for="g in review.goals" :key="g.id" class="goal-row">
              <div class="goal-head">
                <span class="goal-name">{{ g.name }}</span>
                <span class="goal-nums">¥{{ money(g.savedAmount) }} / ¥{{ money(g.targetAmount) }}</span>
              </div>
              <div class="bar-track">
                <div class="bar ok" :style="{ width: Math.min(100, g.percent) + '%' }"></div>
              </div>
            </div>
          </template>
          <p v-else class="muted">还没有储蓄目标，去「储蓄目标」页面创建一个吧。</p>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useStore, controllersApi } from '../data/store.js'
import { money, monthLabel, monthStrOf, todayStr } from '../core/utils.js'

const store = useStore()
const { review: reviewApi } = controllersApi

const maxMonth = monthStrOf(todayStr())
const month = ref(maxMonth)

const shiftMonth = (delta) => {
  const [y, m] = month.value.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  if (next <= maxMonth) month.value = next
}

const review = computed(() => {
  // 访问 store 建立响应式依赖，记账/预算/目标变更后复盘自动更新
  void store.transactions
  void store.budgets
  void store.goals
  return reviewApi.monthlyReview(month.value)
})

const momText = (key) => {
  const r = review.value
  if (!r.prev.hasData) return '上月无数据'
  const d = r.mom[key]
  if (Math.abs(d.diff) < 0.005) return '与上月持平'
  if (d.pct === null) return '上月为 0'
  return `较上月 ${d.diff > 0 ? '+' : '-'}¥${money(Math.abs(d.diff))}（${Math.abs(d.pct)}%）`
}

const momClass = (key, invert = false) => {
  const r = review.value
  if (!r.prev.hasData) return ''
  const d = r.mom[key]
  if (Math.abs(d.diff) < 0.005) return ''
  const good = invert ? d.diff < 0 : d.diff > 0
  return good ? 'good' : 'bad'
}

const rateMomText = computed(() => {
  const r = review.value
  if (!r.prev.hasData) return '上月无数据'
  const diff = r.mom.rate.diff
  if (diff === 0) return '与上月持平'
  return `较上月 ${diff > 0 ? '+' : ''}${diff} 个百分点`
})

const rateMomClass = computed(() => {
  const r = review.value
  if (!r.prev.hasData || r.mom.rate.diff === 0) return ''
  return r.mom.rate.diff > 0 ? 'good' : 'bad'
})
</script>

<style scoped>
.month-nav {
  display: flex;
  align-items: center;
  gap: 8px;
}
.nav-btn {
  padding: 8px 12px;
  font-size: 13px;
}
.nav-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.month-input {
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-size: 14px;
}
.empty .empty-icon {
  font-size: 36px;
  margin-bottom: 8px;
}
.empty-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 6px;
}
.empty p {
  margin: 0;
}
.conclusion-card {
  margin-bottom: 12px;
  border-left: 4px solid var(--accent);
}
.card-title {
  margin: 0 0 10px;
  font-size: 15px;
}
.conclusion-text {
  margin: 0;
  font-size: 15px;
  line-height: 1.9;
}
.advice-card {
  margin-bottom: 16px;
}
.advice-list {
  margin: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--text-secondary);
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
.kpi-label {
  font-size: 12px;
  color: var(--text-secondary);
}
.kpi-value {
  font-size: 24px;
  font-weight: 800;
}
.kpi-value.income { color: var(--income); }
.kpi-value.expense { color: var(--expense); }
.kpi-value.neg { color: var(--expense); }
.kpi-value.accent { color: var(--accent); }
.mom {
  font-size: 12px;
  color: var(--text-secondary);
}
.mom.good { color: var(--income); }
.mom.bad { color: var(--expense); }
.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
@media (max-width: 860px) {
  .two-col { grid-template-columns: 1fr; }
}
.over-row {
  margin-bottom: 12px;
}
.over-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.over-cat {
  font-weight: 700;
}
.over-nums {
  font-size: 12px;
  color: var(--text-secondary);
}
.over-nums em {
  font-style: normal;
  font-weight: 700;
  color: var(--expense);
  margin-left: 4px;
}
.bar-track {
  height: 10px;
  background: var(--bg-elevated);
  border-radius: 999px;
  overflow: hidden;
}
.bar {
  height: 100%;
  border-radius: 999px;
}
.bar.ok { background: linear-gradient(90deg, #57c785, #3aa66f); }
.bar.danger { background: linear-gradient(90deg, #f45b69, #d63a4a); }
.ok-text {
  margin: 0;
  color: var(--income);
  font-weight: 600;
}
.goal-total {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 14px;
}
.total-track {
  flex: 1;
}
.goal-row {
  margin-bottom: 12px;
}
.goal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.goal-name {
  font-weight: 700;
}
.goal-nums {
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
