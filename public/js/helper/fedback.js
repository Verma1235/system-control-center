document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const feedbackBtn = document.getElementById('feedbackBtn');
    const feedbackModal = document.getElementById('feedbackModal');
    const btnFeedbackCancel = document.getElementById('btnFeedbackCancel');
    const feedbackForm = document.getElementById('feedbackForm');

    // Open Modal
    feedbackBtn.addEventListener('click', () => {
        feedbackModal.classList.remove('hidden');
        // Optional: Add a small fade-in effect if desired
        setTimeout(() => feedbackModal.classList.add('opacity-100'), 10);
    });

    // Close Modal Logic
    const closeFeedbackModal = () => {
        feedbackModal.classList.add('hidden');
        feedbackForm.reset();
    };

    btnFeedbackCancel.addEventListener('click', closeFeedbackModal);

    // Close on outside click (matches standard modal behavior)
    feedbackModal.addEventListener('click', (e) => {
        if (e.target === feedbackModal) {
            closeFeedbackModal();
        }
    });

    // Handle Submission
    feedbackForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const payload = {
            type: document.getElementById('feedbackType').value,
            message: document.getElementById('feedbackText').value,
            timestamp: new Date().toISOString()
        };

        // TODO: Emit this via your existing Socket.IO connection or a fetch POST request.
        // Example: socket.emit('submit_feedback', payload);
        console.log('Feedback Payload Prepared:', payload);

        // Visual feedback for the user before closing
        const submitBtn = document.getElementById('btnFeedbackSubmit');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Sent!';
        submitBtn.classList.replace('bg-indigo-600', 'bg-emerald-600');

        setTimeout(() => {
            closeFeedbackModal();
            // Reset button state
            submitBtn.innerHTML = originalText;
            submitBtn.classList.replace('bg-emerald-600', 'bg-indigo-600');
        }, 1200);
    });
});