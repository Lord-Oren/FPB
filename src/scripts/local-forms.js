// Included by dev and private hosted builds only; never by standalone client exports.
(() => { document.querySelectorAll('[data-inquiry-form][data-local="true"]').forEach(form => {
 const status=form.querySelector('[data-form-status]'), feedback=form.querySelector('[data-cv-feedback]');
 form.addEventListener('submit',async event=>{
 if(event.defaultPrevented)return;
      if (form.dataset.local === 'true') {
        event.preventDefault();
        const button = form.querySelector('[type="submit"]');
        if (button.disabled) return;
        button.disabled = true;
        status.textContent = 'Saving to Pond Desk…';
        try {
          const response = await fetch(form.action, { method: 'POST', body: new FormData(form), credentials: form.dataset.hosted === 'true' ? 'same-origin' : 'omit' });
          const result = await response.json();
          if (!response.ok) throw new Error(result.message || result.error || 'Submission refused.');
          status.textContent = form.dataset.hosted === 'true' ? 'Saved in test Pond Desk. No email was sent.' : 'Saved in local Pond Desk. No email was sent.';
          form.reset();
          if (feedback) feedback.textContent = '';
        } catch (error) {
          status.textContent = 'Not saved. Please retry when Pond Desk is available. ' + (error.message || '');
        } finally { button.disabled = false; }
      }

 });
});})();
