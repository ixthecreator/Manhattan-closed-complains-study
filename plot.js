export const colors = { paper: '#f2f0e9', ink: '#34382e', red: '#b93425', faint: '#77786e' };
// 对数压缩让几十秒和几十小时的等待都能看见；加 1 后，零时长仍映射到零。
export const encodeHours = (hours, scale) => scale === 'linear' ? hours : Math.log1p(hours);

// 每条投诉是一根很薄的横向浮动条形，长度来自真实等待时长。
export function traceConfig({ visible, allRecords, state, animate = false, activeId, onHover, onSelect }) {
  const { paper, ink, red, faint } = colors;
  const transform = hours => encodeHours(hours, state.scale);
  // 用完整样本确定横轴范围，筛选后同一条记录不会被视觉放大。
  const maxHours = Math.max(...allRecords.map(r => r.hours));
  const max = transform(maxHours);
  const domain = state.align === 'closed' ? [-max * 1.025, max * .36] : [-max * .035, max * 1.36];
  const ticks = [0, 1, 6, 24, 48, 86].filter(h => h <= maxHours);
  // 最近的一行不一定被点中；检查横向范围，防止右侧空白也选中投诉。
  function hit(event, elements, c) {
    if (!elements.length) return null;
    const i = elements[0].index, bar = c.getDatasetMeta(0).data[i];
    return event.x >= Math.min(bar.x, bar.base) - 6 && event.x <= Math.max(bar.x, bar.base) + 6 ? visible[i].id : null;
  }
  // Chart.js 画时间区间；插件补画纸色背景、关闭红点和选中记录的高亮。
  const endpoints = {
    id: 'endpoints',
    beforeDraw(c) {
      c.ctx.save(); c.ctx.fillStyle = paper; c.ctx.fillRect(0, 0, c.width, c.height); c.ctx.restore();
    },
    afterDatasetsDraw(c) {
      const { ctx, chartArea: area } = c;
      const bars = c.getDatasetMeta(0).data;
      const active = activeId();
      ctx.save();
      bars.forEach((bar, i) => {
        const record = visible[i], isActive = record.id === active;
        // 正负区间的方向不同，提交端与关闭端对应的像素位置也需要交换。
        const start = state.align === 'closed' ? bar.x : bar.base;
        const end = state.align === 'closed' ? bar.base : bar.x;
        const y = bar.y;
        if (isActive) {
          ctx.strokeStyle = red; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(start, y); ctx.lineTo(end, y); ctx.stroke();
          ctx.fillStyle = paper; ctx.beginPath(); ctx.arc(start, y, 2.4, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = red; ctx.lineWidth = .8; ctx.stroke();
        }
        ctx.fillStyle = active && !isActive ? 'rgba(185,52,37,.22)' : red;
        const radius = Math.max(.55, Math.min(1.05, (area.bottom - area.top) / visible.length / 2.5));
        ctx.beginPath(); ctx.arc(end, y, isActive ? 3 : radius, 0, Math.PI * 2); ctx.fill();
      });
      ctx.restore();
    }
  };
  return {
    type: 'bar',
    data: {
      labels: visible.map(r => r.id),
      datasets: [{
        label: 'Recorded elapsed time',
        // [-时长, 0] 对齐各自的关闭时刻；[0, 时长] 对齐各自的提交时刻。
        data: visible.map(r => ({ x: state.align === 'closed' ? [-transform(r.hours), 0] : [0, transform(r.hours)], y: r.id })),
        backgroundColor: 'rgba(52,56,46,.48)', borderWidth: 0, borderSkipped: false, maxBarThickness: visible.length > 100 ? 1 : 1.4, barPercentage: .6, categoryPercentage: 1
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: animate ? { duration: 500, easing: 'easeInOutCubic' } : false,
      indexAxis: 'y',
      interaction: { mode: 'nearest', axis: 'y', intersect: false },
      onHover(event, elements, c) { onHover(hit(event, elements, c)); },
      onClick(event, elements, c) { onSelect(hit(event, elements, c)); },
      layout: { padding: { top: state.guides ? 4 : 20, bottom: state.guides ? 0 : 20, right: 6 } },
      scales: {
        x: {
          min: domain[0], max: domain[1], display: state.guides,
          afterBuildTicks(scale) { scale.ticks = ticks.map(h => ({ value: (state.align === 'closed' ? -1 : 1) * transform(h) })).sort((a, b) => a.value - b.value); },
          grid: { display: false }, border: { display: false },
          // 绘图可用对数坐标，但刻度反算为真实小时，便于阅读。
          ticks: { color: faint, font: { size: 10 }, maxRotation: 0, autoSkip: true, callback(value) { const h = state.scale === 'linear' ? Math.abs(value) : Math.expm1(Math.abs(value)); return `${Math.round(h)} h`; } },
          title: { display: true, text: [state.align === 'closed' ? 'Hours before closure' : 'Hours since submission', state.scale === 'linear' ? 'Linear scale' : 'Compressed scale · log(1 + hours)'], color: faint, font: { size: 11, weight: 'normal' }, padding: 12 }
        },
        y: { display: state.guides, grid: { display: false }, border: { display: false }, ticks: { display: false }, title: { display: true, text: 'Requests', color: faint, font: { size: 10, weight: 'normal' } } }
      },
      plugins: {
        title: { display: state.guides, text: `${visible.length} administrative closures`, align: 'start', color: ink, font: { size: 18, weight: 'normal' }, padding: { bottom: 5 } },
        subtitle: { display: state.guides, text: ['Manhattan · residential noise · September 2026', `Selected sample · rows ordered by ${state.order === 'submitted' ? 'submission' : state.order === 'duration' ? 'duration' : 'reply'}`], align: 'start', color: faint, font: { size: 10 }, padding: { bottom: 20 } },
        legend: { display: state.guides, position: 'bottom', align: 'start', onClick() {}, labels: { color: faint, font: { size: 10 }, boxWidth: 12, boxHeight: 6, padding: 18, usePointStyle: true, generateLabels() { return [{ text: 'Recorded elapsed time', fillStyle: 'rgba(52,56,46,.4)', strokeStyle: 'rgba(52,56,46,.4)', pointStyle: 'line', lineWidth: 1 }, { text: 'Closed endpoint', fillStyle: red, strokeStyle: red, pointStyle: 'circle', lineWidth: 0 }]; } } },
        tooltip: { enabled: false }
      }
    },
    plugins: [endpoints]
  };
}
