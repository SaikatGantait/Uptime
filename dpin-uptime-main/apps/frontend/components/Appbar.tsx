"use client";
import {
    SignInButton,
    SignUpButton,
    SignedIn,
    SignedOut,
    UserButton,
} from '@clerk/nextjs'

export function Appbar() {
    const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    if (!hasClerk) {
        return (
            <div className="flex justify-between items-center p-4">
                <div>DPin Uptime</div>
                <div className="text-sm text-gray-500">Auth disabled (no Clerk key)</div>
            </div>
        );
    }

    return (
        <div className="flex justify-between items-center p-4">
            <div>DPin Uptime</div>
            <div>
                <SignedOut>
                    <SignInButton />
                    <SignUpButton />
                </SignedOut>
                <SignedIn>
                    <UserButton />
                </SignedIn>
            </div>
        </div>
    );
}