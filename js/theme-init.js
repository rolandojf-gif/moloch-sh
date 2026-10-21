/* Aplica el tema guardado antes del primer pintado para evitar el parpadeo. Sin elección guardada, claro. */
try { var t = localStorage.getItem('moloch.theme'); if (t === 'light' || t === 'dark' || t === 'auto') document.documentElement.dataset.theme = t; } catch (e) {}
