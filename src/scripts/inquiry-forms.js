// Join and Contact forms: checks before sending. Accepted files and the size message follow the V1 contract (B6).
(() => {
  const FILE_NAME = /\.(pdf|docx|png|jpe?g|webp|mp4|webm)$/i;
  const FILE_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm'];
  const TOO_LARGE = 'This file is too large (10 MB maximum). Please send a link instead, or contact us by email.';
  document.querySelectorAll('[data-inquiry-form]').forEach(form => {
    const ready = form.dataset.ready === 'true';
    // Site wording (Pond Desk) puts its texts on the form; the English originals stay as the fallback.
    const say = (name, fallback) => form.dataset[name] || fallback;
    const cv = form.querySelector('[data-cv]');
    const feedback = form.querySelector('[data-cv-feedback]');
    const status = form.querySelector('[data-form-status]');
    const requiredText = [...form.querySelectorAll('[data-trim-required]')];
    function validateText(field) {
      field.setCustomValidity(field.value.trim() ? '' : say('msgMissing', 'Please complete this field.'));
    }
    function validateFile() {
      if (!cv) return true;
      const file = cv.files[0];
      let error = '';
      if (file) {
        if (!FILE_NAME.test(file.name) || (file.type && !FILE_TYPES.includes(file.type))) error = say('msgFileType', 'Please choose a PDF, a Word file (DOCX), an image (JPG, PNG, WebP) or a short video (MP4, WebM). Save older Word files (DOC) as PDF first.');
        else if (!file.size) error = say('msgFileEmpty', 'This file is empty. Please choose another one.');
        else if (file.size > Number(form.dataset.cvMaxBytes)) error = say('msgFileLarge', TOO_LARGE);
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
        status.textContent = 'Online sending is not open yet. Nothing has been sent: please email us instead.';
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
