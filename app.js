import { traceConfig } from './plot.js?v=7';
import { alternativeConfig } from './studies.js?v=7';
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const initialView = ['trace', 'scatter', 'replies'].includes(params.get('view')) ? params.get('view') : 'trace';
let records, meta, visible, chart, chartView;
// 用记录 ID 保存悬停与选中状态，排序和切换图表后仍能找到同一条投诉。
let hoverId = null, selectedId = null;
// 所有控件共用这一份状态；图表与控件都从它更新，避免各自保留不同的设置。
const state = { view: initialView, align: 'closed', scale: 'compressed', order: 'submitted', reply: 'all', guides: params.get('read') === '1' || initialView !== 'trace' };

function duration(hours) {
  const seconds = Math.round(hours * 3600);
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
  return `${h ? `${h}h ` : ''}${m ? `${m}m ` : ''}${s || !h && !m ? `${s}s` : ''}`.trim();
}
// 数据时间已是纽约当地时间，直接格式化原字符串，避免浏览器再次换算时区。
function dateLabel(value) { return `${value.slice(5, 10).replace('-', '/')} · ${value.slice(11, 19)}`; }
// 简写只用于阅读；分组仍使用完整回复对应的 responseId，不按简写标签合并。
function shortReply(text) {
  if (text.includes('unable to gain entry')) return 'Unable to gain entry';
  if (text.includes('condition was corrected')) return 'Condition corrected';
  if (text.includes('observed no evidence')) return 'No evidence observed at the time';
  if (text.includes('action was not necessary')) return 'Police action not necessary';
  if (text.includes('not fall under the jurisdiction')) return 'Outside NYPD jurisdiction';
  if (text.includes('no criminal violation upon')) return 'No violation observed on arrival';
  if (text.includes('issued a summons')) return 'Summons issued';
  return 'Additional information provided';
}

// 点击先固定记录，保留首页的无文字画面；抽屉已打开时才切到记录详情。
function selectRecord(id) {
  selectedId = id;
  if (id) {
    fillRecord();
    if (!$('drawer').hidden) selectTab('record');
  } else closeDrawer();
  chart.draw();
}
// 回复条代表一组投诉：按精确回复 ID 筛选，再选中组内第一条真实记录。
function selectResponse(responseId) {
  state.reply = String(responseId);
  selectedId = records.find(r => r.responseId === Number(responseId)).id;
  hoverId = null;
  fillRecord();
  rebuild(false);
  if (!$('drawer').hidden) selectTab('record');
}
// 先筛选、排序，再生成当前图表配置；filter 返回新数组，不改动原始记录顺序。
function rebuild(animate = true) {
  visible = records.filter(r => state.reply === 'all' || r.responseId === Number(state.reply));
  if (state.order === 'duration') visible.sort((a, b) => a.hours - b.hours || a.created.localeCompare(b.created));
  if (state.order === 'reply') visible.sort((a, b) => a.responseId - b.responseId || a.created.localeCompare(b.created));
  const options = {
    // 保留全体记录供图表计算固定坐标范围，防止筛选后线长或柱长被重新放大。
    view: state.view, visible, allRecords: records, meta, state: { ...state }, animate,
    activeId: () => selectedId || hoverId,
    onHover(id) { if (hoverId !== id) { hoverId = id; chart.draw(); } },
    onSelect: selectRecord,
    onGroupSelect: selectResponse
  };
  const config = state.view === 'trace' ? traceConfig(options) : alternativeConfig(options);
  // 同一视图只更新数据；切图时重建，避免浮动条、散点、统计条的坐标轴与插件互相残留。
  if (chart && chartView === state.view) {
    chart.data = config.data;
    chart.options = config.options;
    chart.config.plugins.splice(0, chart.config.plugins.length, ...config.plugins);
    chart.update();
  } else {
    if (chart) chart.destroy();
    chart = new Chart($('traces'), config);
    chartView = state.view;
  }
  $('view-select').value = state.view;
  $('reply-filter').value = state.reply;
  $('order-select').value = state.order;
  $('scale-select').value = state.scale;
  $('view-count').textContent = `${visible.length} / ${records.length} records`;
  $('guides-input').checked = state.guides;
  $('align-input').checked = state.align === 'closed';
  $('guides-button').classList.toggle('active', state.guides);
  for (const id of ['order-control', 'scale-control', 'align-control']) $(id).hidden = state.view !== 'trace';
}

// 详情始终回查原始记录；摘要与关键词高亮只改变展示，完整官方回复仍可展开核对。
function fillRecord() {
  const r = records.find(r => r.id === selectedId);
  if (!r) return;
  $('record-position').textContent = `${String(records.indexOf(r) + 1).padStart(3, '0')} / ${records.length}`;
  $('record-id').textContent = `#${r.id}`;
  $('record-duration').textContent = duration(r.hours);
  $('record-created').textContent = dateLabel(r.created);
  $('record-closed').textContent = dateLabel(r.closed);
  $('record-detail').textContent = r.detail;
  $('reply-summary').textContent = shortReply(r.response);
  const phrase = 'If the problem persists';
  const at = r.response.indexOf(phrase);
  $('reply-condition').hidden = at === -1;
  $('reply-condition').textContent = at === -1 ? '' : '“If the problem persists,” contact 311 again.';
  document.querySelector('.response-source').open = false;
  if (at === -1) $('record-response').textContent = r.response;
  else {
    const mark = document.createElement('mark'); mark.textContent = phrase;
    $('record-response').replaceChildren(document.createTextNode(r.response.slice(0, at)), mark, document.createTextNode(r.response.slice(at + phrase.length)));
  }
  const matching = records.filter(d => d.responseId === r.responseId).length;
  $('same-reply-button').textContent = `${matching} record${matching === 1 ? '' : 's'} with this reply →`;
}
function selectTab(tab) {
  if (tab === 'record' && !selectedId && visible.length) { selectedId = visible[Math.floor(visible.length / 2)].id; fillRecord(); }
  ['record', 'study', 'controls'].forEach(name => $(`${name}-panel`).hidden = name !== tab);
  document.querySelectorAll('[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
  $('drawer').scrollTop = 0;
}
function openDrawer(tab) { $('drawer').hidden = false; document.body.classList.add('drawer-open'); selectTab(tab); }
function closeDrawer() { $('drawer').hidden = true; document.body.classList.remove('drawer-open'); hoverId = null; chart.draw(); }

// 页面读取固定 JSON 快照，确保展示可复现；它不会在打开时重新查询在线 311 数据。
async function start() {
  const response = await fetch('data/requests.json');
  ({ meta, records } = await response.json());
  Chart.defaults.font.family = 'Helvetica, "Helvetica Neue", Arial, sans-serif';
  const values = [['Median wait', duration(meta.stats.medianHours)], ['Range', `${duration(meta.stats.minHours)} – ${duration(meta.stats.maxHours)}`], ['Official replies', meta.stats.uniqueReplies]];
  $('sample-stats').innerHTML = values.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('');
  $('finding').textContent = `${meta.stats.conditionalReplies} of ${records.length} replies say “If the problem persists” and invite another complaint.`;
  $('method').textContent = `Ten evenly spaced requests per day, selected from ${meta.populationCount.toLocaleString()} matching records.`;
  const replies = [...new Map(records.map(r => [r.responseId, r.response])).entries()].sort((a, b) => records.filter(r => r.responseId === b[0]).length - records.filter(r => r.responseId === a[0]).length);
  $('reply-filter').add(new Option(`All official replies · ${records.length}`, 'all'));
  replies.forEach(([id, text]) => $('reply-filter').add(new Option(`${shortReply(text)} · ${records.filter(r => r.responseId === id).length}`, String(id))));
  rebuild(false);
  // 数据与首屏就绪后绑定操作；控件先改共享状态，再统一交给 rebuild 更新画面。
  $('traces').addEventListener('mouseleave', () => { hoverId = null; chart.draw(); });
  $('guides-button').onclick = () => { state.guides = !state.guides; rebuild(); };
  $('study-button').onclick = () => $('drawer').hidden ? openDrawer(selectedId ? 'record' : 'study') : closeDrawer();
  $('close-button').onclick = closeDrawer;
  document.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => { selectTab(button.dataset.tab); chart.draw(); });
  $('view-select').onchange = e => { state.view = e.target.value; state.guides = state.view !== 'trace'; hoverId = null; rebuild(false); };
  $('reply-filter').onchange = e => { state.reply = e.target.value; selectedId = null; hoverId = null; rebuild(); };
  $('order-select').onchange = e => { state.order = e.target.value; rebuild(); };
  $('scale-select').onchange = e => { state.scale = e.target.value; rebuild(); };
  $('guides-input').onchange = e => { state.guides = e.target.checked; rebuild(); };
  $('align-input').onchange = e => { state.align = e.target.checked ? 'closed' : 'submitted'; rebuild(); };
  $('same-reply-button').onclick = () => { state.reply = String(records.find(r => r.id === selectedId).responseId); hoverId = null; rebuild(); };
  // 翻页沿当前筛选、排序后的记录循环，避免跳进画面外的投诉。
  function stepRecord(step) { if (!visible.length) return; const index = visible.findIndex(r => r.id === selectedId); selectedId = visible[(index + step + visible.length) % visible.length].id; fillRecord(); chart.draw(); }
  $('previous-record').onclick = () => stepRecord(-1); $('next-record').onclick = () => stepRecord(1);
  $('reset-button').onclick = () => { Object.assign(state, { view: 'trace', align: 'closed', scale: 'compressed', order: 'submitted', reply: 'all', guides: false }); selectedId = null; hoverId = null; rebuild(false); };
  // 导出当前视图与筛选结果；先去掉临时悬停高亮并重画，再读取 Canvas 的 PNG。
  $('export-button').onclick = () => { hoverId = null; chart.draw(); const link = document.createElement('a'); link.download = `closed-${state.view}-${state.reply}.png`; link.href = chart.toBase64Image(); link.click(); };
  if (params.get('panel') === 'view') openDrawer('controls');
}
start();
