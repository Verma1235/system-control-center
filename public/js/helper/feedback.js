import { api } from "../core/api.js";

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const feedbackBtn = document.getElementById('feedbackBtn');
    const feedbackModal = document.getElementById('feedbackModal');
    const btnFeedbackCancel = document.getElementById('btnFeedbackCancel');
    const feedbackForm = document.getElementById('feedbackForm');
    const charCount = document.getElementById("charCount");
    const textBox = document.querySelector('#feedbackText');
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


    textBox.addEventListener('input', (e) => {
        const length = e.target.value.length;
        charCount.innerText = `${length} / 200`;

    })

    // Handle Submission
    feedbackForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userMessage = textBox.value;
        if (await isEmpty(userMessage)) {
            await window.customAlert('message/feedback  is empty !', 'warning');
            return
        }
        if (userMessage.length > 200) {
            await window.customAlert('message length should be under 200 characters.');
            return
        }
        const payload = {
            type: document.getElementById('feedbackType').value,
            message: userMessage,
            timestamp: new Date().toISOString()
        };

        // TODO: Emit this via your existing Socket.IO connection or a fetch POST request.
        // Example: socket.emit('submit_feedback', payload);
        console.log('Feedback Payload Prepared:', payload);

        // sending data via api through post method end point-> /user/inquiries

        try {
            const res = await api.sendInquiries(payload);
            if (res.success) {
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

                await window.customAlert("Feedback successfully sent!");

            } else {

                await window.customAlert(`${res?.message || 'some error occurs ! try after few minutes later.'}`)
            }



        } catch (error) {

            await window.customAlert(`ERROR:${error?.message}`, "Warning");
            return;
        }








    });
});