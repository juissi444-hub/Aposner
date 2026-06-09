import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'

// Initialize the client
const supabase = createClient('YOUR_SUPABASE_URL', 'YOUR_ANON_KEY')

export default function App() {
  const [session, setSession] = useState(null)

  useEffect(() => {
    // 1. Check if the user is already logged in when the page loads
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    // 2. Listen for login/logout events (like returning from the magic link)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    // Cleanup the listener
    return () => subscription.unsubscribe()
  }, [])

  // 3. Conditional Rendering: Show login if no active session
  if (!session) {
    return (
      <div style={{ maxWidth: '400px', margin: '0 auto', padding: '50px' }}>
        <h2>Sign In</h2>
        <Auth
          supabaseClient={supabase}
          appearance={{ theme: ThemeSupa }}
          view="magic_link"
          showLinks={false}
          providers={[]}
        />
      </div>
    )
  }

  // 4. Show your main application if they are authenticated
  return (
    <div>
      <h1>Welcome back!</h1>
      <p>Logged in as: {session.user.email}</p>
      
      {/* <Leaderboard /> */}
      
      <button onClick={() => supabase.auth.signOut()}>
        Sign Out
      </button>
    </div>
  )
}
