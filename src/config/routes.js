export const routes = [
    {
        access: ['user', 'admin'],
        routes: [
            '/dashboard',
            '/dashboard/conversations',
            '/dashboard/catalogue',
            '/dashboard/bookings',
            '/dashboard/knowledge-base',
            '/dashboard/personas',
            '/dashboard/channels',
            '/dashboard/business',
            '/dashboard/billing',
            '/dashboard/account'
        ]
    },
    {
        routes: [
            '/login',
            '/register'
        ]
    }
]
