import { useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import { ConfirmProvider } from './components/common/ConfirmProvider'
import { DeckListPage } from './components/DeckList/DeckListPage'
import { InputPage } from './components/Input/InputPage'
import { FlashPage } from './components/Flash/FlashPage'
import { sweepOrphanImages } from './lib/imageStore'

function App() {
  // Safety net for image blobs left behind by abandoned drafts or
  // interrupted edits (normal deletes/replacements already clean up their
  // own images immediately) — runs once per app load.
  useEffect(() => {
    sweepOrphanImages().catch(() => {})
  }, [])

  return (
    <ConfirmProvider>
      <Routes>
        <Route path="/" element={<DeckListPage />} />
        <Route path="/decks/:deckId/input" element={<InputPage />} />
        <Route path="/decks/:deckId/flash" element={<FlashPage />} />
      </Routes>
    </ConfirmProvider>
  )
}

export default App
