import spriteUrl from '../assets/fox-spirites.png';
import { mountFoxAnimation } from './foxAnimation.js';
import { eventBus } from '../shared/eventBus.js';
import { EVENTS } from '../shared/contracts.js';

const button = document.querySelector('#celebrate');
const dispose = mountFoxAnimation(document.querySelector('#fox'), {
  src: spriteUrl,
  onStatus(status) {
    button.disabled = status !== 'ready';
    document.querySelector('#status').textContent = {
      loading: '正在加载图片', ready: '图片已加载，可以测试庆祝', error: '图片加载失败',
    }[status];
  },
});
button.onclick = () => eventBus.emit(EVENTS.REP_COMPLETED, { timestampMs: performance.now(), isMock: true });
window.addEventListener('pagehide', dispose, { once: true });
if (import.meta.hot) import.meta.hot.dispose(dispose);
