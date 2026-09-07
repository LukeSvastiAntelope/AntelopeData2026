import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Sign in',
    description: 'Sign in to Antelope — AI-powered polling and campaign intelligence.',
};

const AuthLayout = ({ children }: { children: React.ReactNode }) => {
    return (
        <div className="flex flex-col items-center justify-center w-screen h-screen bg-cover bg-center bg-no-repeat m-0">
            {children}
        </div>
    )
}

export default AuthLayout;