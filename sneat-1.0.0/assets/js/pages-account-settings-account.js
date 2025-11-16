/**
 * Account Settings - Account
 */

'use strict';

document.addEventListener('DOMContentLoaded', function () {
  const accountUserImage = document.getElementById('uploadedAvatar');
  const fileInput = document.querySelector('.account-file-input');
  const resetFileButton = document.querySelector('.account-image-reset');

  if (accountUserImage && !accountUserImage.dataset.defaultSrc) {
    accountUserImage.dataset.defaultSrc = accountUserImage.src;
  }

  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const [file] = fileInput.files || [];
      if (!file) return;
      const event = new CustomEvent('account-avatar-selected', {
        detail: { file }
      });
      document.dispatchEvent(event);
    });
  }

  if (resetFileButton) {
    resetFileButton.addEventListener('click', () => {
      if (fileInput) {
        fileInput.value = '';
      }
      document.dispatchEvent(new CustomEvent('account-avatar-reset'));
    });
  }
});
