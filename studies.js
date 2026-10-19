import { colors } from './plot.js?v=7';

const font = { family: 'Helvetica, Helvetica Neue, Arial, sans-serif', size: 14 };

// 标签只做显示缩写；回复分组仍使用完整原文对应的 responseId。
function replyLabel(text) {
  if (text.includes('unable to gain entry')) return 'Unable to enter';
  if (text.includes('condition was corrected')) return 'Condition corrected';
  if (text.includes('observed no evidence')) return 'No evidence observed';
  if (text.includes('action was not necessary')) return 'Action not necessary';
  if (text.includes('not fall under the jurisdiction')) return 'Outside jurisdiction';
  if (text.includes('no criminal violation upon')) return 'No violation on arrival';
  if (text.includes('issued a summons')) return 'Summons issued';
  return 'Additional information';
}

// 按单词换行，限制标签宽度，避免窄屏把柱形区域挤出画布。
function wrapReplyLabel(value) {
  const lines = [];
  for (const word of this.getLabelForValue(value).split(' ')) {
    const last = lines.length - 1;
    if (last < 0 || `${lines[last]} ${word}`.length > 12) lines.push(word);
    else lines[last] += ` ${word}`;
  }
  return lines;
}

function countReplies(records) {
  const counts = new Map();
  for (const record of records) counts.set(record.responseId, (counts.get(record.responseId) || 0) + 1);
  return counts;
}

// 首页两种备选视图共用字体、底色及交互；记录详情由现有侧栏展示。
export function alternativeConfig({ view, visible, allRecords, meta, state, activeId, onHover, onSelect, onGroupSelect }) {
  const { ink, faint, red, paper } = colors;
  const guides = state.guides;
  const visibleById = new Map(visible.map(record => [record.id, record]));
  const config = {
    type: view === 'scatter' ? 'scatter' : 'bar',
    data: { datasets: [] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false, font,
      plugins: {
        title: { display: false },
        subtitle: { display: false },
        legend: { display: guides, position: 'bottom', align: 'start', labels: { color: faint, boxWidth: 10, font }, onClick() {} },
        tooltip: { backgroundColor: ink, titleFont: { ...font, weight: 'normal' }, bodyFont: font, padding: 12 }
      },
      layout: { padding: state.guides ? 0 : 20 },
      interaction: { mode: 'nearest', intersect: true }
    },
    plugins: [{
      id: 'paper',
      beforeDraw(chart) {
        chart.ctx.save();
        chart.ctx.fillStyle = paper;
        chart.ctx.fillRect(0, 0, chart.width, chart.height);
        chart.ctx.restore();
      }
    }]
  };
  let groups;

  if (view === 'scatter') {
    config.data.datasets = [{
      label: 'One request',
      data: visible.map(record => ({
        x: Number(record.created.slice(8, 10)) + (Number(record.created.slice(11, 13)) + Number(record.created.slice(14, 16)) / 60) / 24,
        y: record.hours,
        id: record.id
      })),
      backgroundColor: red, pointRadius: 2.4, pointHoverRadius: 5
    }];
    // 横轴固定为九月；纵轴依据完整样本，筛选后不重新缩放。
    const maxHours = Math.max(90, Math.ceil(Math.max(...allRecords.map(record => record.hours)) / 10) * 10);
    config.options.scales = {
      x: { display: guides, min: 1, max: 31, grid: { display: false }, border: { color: '#d0d0c4' }, ticks: { color: faint, font, stepSize: 5, callback: value => value === 31 ? '1 Oct' : `${Math.round(value)} Sep` }, title: { display: true, text: 'Submission date · September 2026', color: faint, font: { ...font, weight: 'normal' } } },
      y: { display: guides, min: 0, max: maxHours, grid: { color: '#deddd5', lineWidth: .6 }, border: { display: false }, ticks: { color: faint, font, callback: value => `${value} h` }, title: { display: true, text: 'Hours to closure · linear scale', color: faint, font: { ...font, weight: 'normal' } } }
    };
    config.options.plugins.tooltip.callbacks = {
      title: items => `Request #${items[0].raw.id}`,
      label: item => `${item.raw.y.toFixed(2)} h to closure`
    };
  } else {
    const idsByText = new Map(allRecords.map(record => [record.response, record.responseId]));
    const fullCounts = countReplies(allRecords);
    const visibleCounts = countReplies(visible);
    // 按完整样本频次排序；筛选后保留零值组，方便比较同一行。
    groups = meta.replyCounts.map(reply => ({
      responseId: idsByText.get(reply.text),
      label: replyLabel(reply.text),
      fullCount: fullCounts.get(idsByText.get(reply.text))
    })).sort((a, b) => b.fullCount - a.fullCount);
    config.data.labels = groups.map(group => group.label);
    config.data.datasets = [{
      label: 'Closed requests',
      data: groups.map(group => visibleCounts.get(group.responseId) || 0),
      responseIds: groups.map(group => group.responseId),
      backgroundColor: ink, barThickness: 10, borderWidth: 0
    }];
    config.options.indexAxis = 'y';
    // 柱形横轴同样使用完整样本上限，筛选只改变数量。
    config.options.scales = {
      x: { display: guides, beginAtZero: true, min: 0, max: Math.max(...groups.map(group => group.fullCount)), grid: { color: '#deddd5', lineWidth: .6 }, border: { display: false }, ticks: { color: faint, font, precision: 0 }, title: { display: true, text: 'Requests', color: faint, font: { ...font, weight: 'normal' } } },
      y: { display: guides, grid: { display: false }, border: { display: false }, ticks: { color: ink, font, callback: wrapReplyLabel } }
    };
    config.options.plugins.tooltip.callbacks = {
      title: items => groups[items[0].dataIndex].label,
      label: item => `${item.raw} ${item.raw === 1 ? 'request' : 'requests'}`
    };
  }

  // Chart.js 已检查实际命中；这里只排除空白和零值柱。
  function hitIndex(elements) {
    const index = elements[0]?.index;
    if (index === undefined) return null;
    if (view === 'replies' && config.data.datasets[0].data[index] === 0) return null;
    return index;
  }
  config.options.onHover = (event, elements) => {
    const index = hitIndex(elements);
    onHover(view === 'scatter' && index !== null ? config.data.datasets[0].data[index].id : null);
  };
  config.options.onClick = (event, elements) => {
    const index = hitIndex(elements);
    if (index === null) { onSelect(null); return; }
    if (view === 'scatter') onSelect(config.data.datasets[0].data[index].id);
    else onGroupSelect(groups[index].responseId);
  };
  // 高亮独立绘制，悬停或固定记录时无需重建数据与坐标轴。
  config.plugins.push({
    id: 'activeAlternative',
    afterDatasetsDraw(chart) {
      const record = visibleById.get(activeId());
      if (!record) return;
      const index = view === 'scatter'
        ? config.data.datasets[0].data.findIndex(point => point.id === record.id)
        : groups.findIndex(group => group.responseId === record.responseId);
      const mark = chart.getDatasetMeta(0).data[index];
      const { ctx } = chart;
      ctx.save();
      if (view === 'scatter') {
        ctx.fillStyle = paper;
        ctx.strokeStyle = red;
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(mark.x, mark.y, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = red;
        ctx.beginPath(); ctx.arc(mark.x, mark.y, 2.4, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = red;
        ctx.fillRect(Math.min(mark.base, mark.x), mark.y - mark.height / 2, Math.abs(mark.x - mark.base), mark.height);
      }
      ctx.restore();
    }
  });
  return config;
}
