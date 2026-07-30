(function () {
  "use strict";

  try {
    if (typeof MBG !== "undefined" && MBG) window.MBG = MBG;
  } catch (error) {
    console.warn("FENIX: nie udało się udostępnić stanu MBG warstwie audytu.", error);
  }
})();
