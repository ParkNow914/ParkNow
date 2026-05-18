document.addEventListener('DOMContentLoaded', function() {
    // Toggle password visibility
    document.getElementById('togglePassword').addEventListener('click', function() {
        const passwordInput = document.getElementById('registerSenha');
        const icon = this.querySelector('i');
        
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        } else {
            passwordInput.type = 'password';
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    });

    // Special characters pattern
    const specialCharsPattern = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/;

    // Password strength checker
    document.getElementById('registerSenha').addEventListener('input', function() {
        const password = this.value;
        const strengthBar = document.getElementById('password-strength-bar');
        const strengthText = document.querySelector('#password-strength-text span');
        
        // Check password requirements
        const hasMinLength = password.length >= 8;
        const hasUpperCase = /[A-Z]/.test(password);
        const hasNumber = /\d/.test(password);
        const hasSpecialChar = specialCharsPattern.test(password);
        
        // Update requirement indicators
        updateRequirement('length', hasMinLength);
        updateRequirement('uppercase', hasUpperCase);
        updateRequirement('number', hasNumber);
        updateRequirement('special', hasSpecialChar);
        
        // Calculate strength score (0-100)
        let strength = 0;
        if (hasMinLength) strength += 20;
        if (hasUpperCase) strength += 20;
        if (hasNumber) strength += 20;
        if (hasSpecialChar) strength += 20;
        
        // Add extra points for length
        if (password.length > 12) strength += 10;
        if (password.length > 16) strength += 10;
        
        // Update progress bar and text
        strengthBar.style.width = strength + '%';
        
        // Set color based on strength
        if (strength < 40) {
            strengthBar.className = 'progress-bar bg-danger';
            strengthText.textContent = 'Muito fraca';
            strengthText.style.color = '#dc3545';
        } else if (strength < 70) {
            strengthBar.className = 'progress-bar bg-warning';
            strengthText.textContent = 'Fraca';
            strengthText.style.color = '#ffc107';
        } else if (strength < 90) {
            strengthBar.className = 'progress-bar bg-info';
            strengthText.textContent = 'Boa';
            strengthText.style.color = '#17a2b8';
        } else {
            strengthBar.className = 'progress-bar bg-success';
            strengthText.textContent = 'Forte';
            strengthText.style.color = '#28a745';
        }
        
        // Validate password match
        validatePasswordMatch();
    });
    
    // Password confirmation validation
    document.getElementById('confirmarSenha').addEventListener('input', validatePasswordMatch);
    
    function updateRequirement(id, isValid) {
        const element = document.getElementById(id);
        if (isValid) {
            element.classList.remove('text-danger');
            element.classList.add('text-success');
        } else {
            element.classList.remove('text-success');
            element.classList.add('text-danger');
        }
    }
    
    function validatePasswordMatch() {
        const password = document.getElementById('registerSenha').value;
        const confirmPassword = document.getElementById('confirmarSenha').value;
        const confirmInput = document.getElementById('confirmarSenha');
        
        if (confirmPassword === '') {
            confirmInput.classList.remove('is-valid', 'is-invalid');
            return;
        }
        
        if (password === confirmPassword) {
            confirmInput.classList.remove('is-invalid');
            confirmInput.classList.add('is-valid');
        } else {
            confirmInput.classList.remove('is-valid');
            confirmInput.classList.add('is-invalid');
        }
    }
    
    // Form validation
    document.getElementById('registerForm').addEventListener('submit', function(e) {
        const password = document.getElementById('registerSenha').value;
        const confirmPassword = document.getElementById('confirmarSenha').value;
        const passwordInput = document.getElementById('registerSenha');
        const confirmInput = document.getElementById('confirmarSenha');
        
        // Check if passwords match
        if (password !== confirmPassword) {
            e.preventDefault();
            confirmInput.classList.add('is-invalid');
            return false;
        }
        
        // Check password strength requirements
        const hasMinLength = password.length >= 8;
        const hasUpperCase = /[A-Z]/.test(password);
        const hasNumber = /\d/.test(password);
        const hasSpecialChar = specialCharsPattern.test(password);
        
        if (!hasMinLength || !hasUpperCase || !hasNumber || !hasSpecialChar) {
            e.preventDefault();
            passwordInput.classList.add('is-invalid');
            return false;
        }
        
        return true;
    });
});
