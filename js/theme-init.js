/* Aplica el tema guardado antes del primer pintado para evitar el parpadeo. */
try { var t = localStorage.getItem('moloch.theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch (e) {}
