"use strict";

/* Compact section navigation for narrow screens. */
window.ResponsiveAppMenu = (function () {
    let initialized = false;

    function closeAll(except = null) {
        document.querySelectorAll(".responsive-app-menu.is-open").forEach(menu => {
            if (menu !== except) {
                menu.classList.remove("is-open");
                menu.previousElementSibling?.setAttribute("aria-expanded", "false");
            }
        });
    }

    function init() {
        if (initialized) return true;
        initialized = true;

        document.querySelectorAll(".responsive-app-menu-button").forEach(button => {
            const menu = button.nextElementSibling;
            if (!menu || !menu.classList.contains("responsive-app-menu")) return;
            button.addEventListener("click", event => {
                event.stopPropagation();
                const open = menu.classList.toggle("is-open");
                closeAll(open ? menu : null);
                button.setAttribute("aria-expanded", String(open));
            });
            menu.querySelectorAll("[data-app-target]").forEach(item => {
                item.addEventListener("click", () => {
                    closeAll();
                    window.AppSwitcher?.show(item.getAttribute("data-app-target"));
                });
            });
        });

        document.addEventListener("click", () => closeAll());
        window.addEventListener("app:switched", () => closeAll());
        return true;
    }

    return { init };
})();

document.addEventListener("DOMContentLoaded", () => ResponsiveAppMenu.init());
