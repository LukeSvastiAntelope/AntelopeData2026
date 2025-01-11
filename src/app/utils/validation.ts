export function validateUserName(username: string) {
    console.log(username);
    // const isAlphanumeric = /^[a-zA-Z0-9]+$/.test(username);
    // if (!isAlphanumeric) return "Username must be alphanumeric.";
    // if (username.length <= 3) return "Username must be longer than 3 characters.";
    return null;
}

export const validatePassword = (password: string) => {
    const isStrong = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/.test(password);
    if (!isStrong) return "Password must be at least 8 characters long, contain at least one uppercase letter, one lowercase letter, one number, and one special character.";
    return null;
};