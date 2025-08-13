export function validateEmail(email: string) {
    if (!email || email.trim().length === 0) return "Email is required";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return "Please enter a valid email address";
    if (email.length > 254) return "Email is too long";
    return null;
}

export function validateDisplayName(displayName: string) {
    if (!displayName || displayName.trim().length === 0) return "Display name is required";
    if (displayName.length < 2) return "Display name must be at least 2 characters";
    if (displayName.length > 50) return "Display name must be less than 50 characters";
    if (!/^[a-zA-Z0-9_\s-]+$/.test(displayName)) return "Display name can only contain letters, numbers, spaces, hyphens, and underscores";
    return null;
}

// Keep for backward compatibility during migration
export function validateUserName(username: string) {
    console.log(username);
    // const isAlphanumeric = /^[a-zA-Z0-9]+$/.test(username);
    // if (!isAlphanumeric) return "Username must be alphanumeric.";
    // if (username.length <= 3) return "Username must be longer than 3 characters.";
    return null;
}

export const validatePassword = (password: string) => {
    // Require: 8+ chars, at least one upper, one lower, one digit, and one non-alphanumeric (broader set)
    const isStrong = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(password);
    if (!isStrong) return "Password must be at least 8 characters long, contain at least one uppercase letter, one lowercase letter, one number, and one special character.";
    return null;
};