import {MDCRipple} from '@material/ripple';

const selector = '.mdc-button, .mdc-icon-button, .mdc-card__primary-action';
const ripples = [].map.call(document.querySelectorAll(selector), function(el) {
  return new MDCRipple(el);
});

import {MDCTabBar} from '@material/tab-bar';

const tabBar = new MDCTabBar(document.querySelector('.mdc-tab-bar'));