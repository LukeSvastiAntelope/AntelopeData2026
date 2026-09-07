export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold mb-4">404 - Page Not Found</h1>
      <p className="text-muted-foreground mb-8">The page you're looking for doesn't exist.</p>
      <a href="/" className="text-primary hover:underline">Return to home</a>
    </div>
  );
}

