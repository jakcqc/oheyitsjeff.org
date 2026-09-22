/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * Source-available for noncommercial public-source projects.
 * No AI/ML training. No paid/commercial or closed-source application use.
 * Personal noncommercial experimentation is permitted.
 * Violating these conditions terminates permission under this license.
 * See LICENSE.md at the repository root for the full terms.
 */

import { initGalleryTheme } from './galleryTheme.js';

const template = document.createElement('template');
template.innerHTML = `
    <div id="footer">
        <div id="textMain">
            <div class="aboutUs"><a href="https://www.linkedin.com/in/jeffrey-kerley-30b5451b3/" target="_blank" rel="noopener noreferrer">LinkedIn</a></div>
            <button class="aboutUs aboutUsButton" id="supportTrigger" type="button" aria-haspopup="dialog" aria-controls="supportModal">
                Support
            </button>
            <button id="themeToggle" type="button" aria-pressed="false">dark</button>
        </div>
    </div>  
    <div id="supportModal" class="supportModal" aria-hidden="true">
        <div class="supportModal__backdrop" data-close-support="true"></div>
        <div class="supportModal__panel" role="dialog" aria-modal="true" aria-labelledby="supportTitle">
            <div class="supportModal__header">
                <div>
                    <div class="supportModal__eyebrow">Support</div>
                    <h2 id="supportTitle">PayPal</h2>
                </div>
                <button class="supportModal__close" id="supportClose" type="button" aria-label="Close support panel">Close</button>
            </div>
            <div class="supportTabs" role="tablist" aria-label="Support options">
                <button
                    class="supportTabs__tab active"
                    id="supportTabDonation"
                    type="button"
                    role="tab"
                    aria-selected="true"
                    aria-controls="supportPanelDonation"
                >
                    Donation
                </button>
            </div>
            <div
                class="supportPanel active"
                id="supportPanelDonation"
                role="tabpanel"
                aria-labelledby="supportTabDonation"
            >
                <p class="supportPanel__copy">Support the site through PayPal. </p>
                <!-- <div class="supportInfoRow">
                    <span class="supportInfoRow__label">PayPal contact</span>
                    <span class="supportInfoRow__value" id="supportPayPalContact"></span>
                </div> -->
                <a
                    class="supportDonateButton"
                    id="supportDonateLink"
                    href="#"
                    target="_blank"
                    rel="noreferrer"
                >
                    Open PayPal donation page
                </a>
                <p class="supportPanel__helper" id="supportDonateHelper"></p>
            </div>
        </div>
    </div>
`;
document.getElementById('siteFooter')?.replaceWith(template.content);

const SUPPORT_CONFIG = {
  paypalContactLabel: "16182104807",
  // Replace this with your real PayPal donate URL or hosted button URL.
  paypalDonationUrl: "https://paypal.me/oheyitsjeff?country.x=US&locale.x=en_US"
};

function syncSupportUi() {
  const contactEl = document.getElementById("supportPayPalContact");
  if (contactEl) contactEl.textContent = SUPPORT_CONFIG.paypalContactLabel || "Add PayPal contact";

  const donateLink = document.getElementById("supportDonateLink");
  const helper = document.getElementById("supportDonateHelper");
  if (!donateLink || !helper) return;

  if (SUPPORT_CONFIG.paypalDonationUrl) {
    donateLink.href = SUPPORT_CONFIG.paypalDonationUrl;
    donateLink.removeAttribute("aria-disabled");
    donateLink.classList.remove("is-disabled");
    helper.textContent = "This opens PayPal in a new tab.";
    return;
  }

  donateLink.href = "#";
  donateLink.setAttribute("aria-disabled", "true");
  donateLink.classList.add("is-disabled");
  helper.textContent = "Add your final PayPal donate URL in helper/galleryFooter.js to make this button live.";
}

function setSupportModalOpen(isOpen) {
  const modal = document.getElementById("supportModal");
  if (!modal) return;

  modal.classList.toggle("is-open", Boolean(isOpen));
  modal.setAttribute("aria-hidden", isOpen ? "false" : "true");
  document.body.classList.toggle("support-modal-open", Boolean(isOpen));
}

function initSupportModal() {
  syncSupportUi();

  const openBtn = document.getElementById("supportTrigger");
  const closeBtn = document.getElementById("supportClose");
  const modal = document.getElementById("supportModal");
  const donateLink = document.getElementById("supportDonateLink");

  if (openBtn) {
    openBtn.addEventListener("click", () => {
      setSupportModalOpen(true);
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      setSupportModalOpen(false);
    });
  }

  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target instanceof HTMLElement && event.target.dataset.closeSupport === "true") {
        setSupportModalOpen(false);
      }
    });
  }

  if (donateLink) {
    donateLink.addEventListener("click", (event) => {
      if (!SUPPORT_CONFIG.paypalDonationUrl) {
        event.preventDefault();
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setSupportModalOpen(false);
    }
  });
}

initSupportModal();
initGalleryTheme();
