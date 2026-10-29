(() => {
  document.querySelectorAll('[data-inquiry-form]').forEach(form => {
    const ready = form.dataset.ready === 'true';
    const cv = form.querySelector('[data-cv]');
    const feedback = form.querySelector('[data-cv-feedback]');
    const status = form.querySelector('[data-form-status]');
    const requiredText = [...form.querySelectorAll('[data-trim-required]')];
    function validateText(field) {
      field.setCustomValidity(field.value.trim() ? '' : 'Please complete this field.');
    }
    function validateFile() {
      if (!cv) return true;
      const file = cv.files[0];
      let error = '';
      if (file) {
        if (!/\.pdf$/i.test(file.name) || (file.type && file.type !== 'application/pdf')) error = 'Please choose a PDF file.';
        else if (!file.size) error = 'This file is empty. Please choose another PDF.';
        else if (file.size > Number(form.dataset.cvMaxBytes)) error = 'Please choose a PDF smaller than 5 MB.';
      }
      cv.setCustomValidity(error);
      cv.setAttribute('aria-invalid', String(Boolean(error)));
      feedback.dataset.error = String(Boolean(error));
      feedback.textContent = error || (file ? `${file.name} · ${file.size < 1024 * 1024 ? `${Math.max(1, Math.ceil(file.size / 1024))} KB` : `${(file.size / 1024 / 1024).toFixed(2)} MB`} selected` : '');
      return !error;
    }
    requiredText.forEach(field => field.addEventListener('input', () => validateText(field)));
    cv?.addEventListener('change', validateFile);
    form.addEventListener('submit', event => {
      if (!ready) {
        event.preventDefault();
        status.textContent = 'Preview only. Nothing has been sent.';
        return;
      }
      requiredText.forEach(validateText);
      const validFile = validateFile();
      if (!validFile || !form.checkValidity()) {
        event.preventDefault();
        form.reportValidity();
      }
      // A configured service receives the native POST and supplies the delivery result.
    });
  });
})();
