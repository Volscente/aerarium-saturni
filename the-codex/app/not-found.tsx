export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold text-roman-gold">404</h1>
      <p className="text-roman-stone">Page not found.</p>
      <a href="/" className="text-roman-terracotta hover:text-roman-gold transition-colors">
        ← Back to home
      </a>
    </div>
  )
}
