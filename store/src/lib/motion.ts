/** Where the "Pause animations" choice is kept, and the tiny script that applies it before the page paints. */
export const MOTION_KEY = "tfd-motion";
export const MOTION_INIT_SCRIPT = `try{if(localStorage.getItem("${MOTION_KEY}")==="paused")document.documentElement.dataset.motion="paused"}catch(e){}`;
