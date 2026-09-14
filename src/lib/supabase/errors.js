export default function supabaseErrors ({error, t}) {
    switch (error.message) {
        case "User already registered":
            return {
                success: false,
                message: 'Email already exists'
            }
        case "Email not confirmed":
            return {
                success: false,
                message: "Email is not confirmed"
            }
        case "Invalid login credentials":
            return {
                success: false,
                message: t.passwordIncorrect
            }
        case "The object name contains invalid characters":
            return {
                success: false,
                message: "The name of file should not consist invalid characters"
            }
        default:
            return {
                success: false,
                message: error.message
            }
    }
}