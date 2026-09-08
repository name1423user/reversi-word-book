import { Route, Routes } from 'react-router-dom'
import { ConfirmProvider } from './components/common/ConfirmProvider'
import { DeckListPage } from './components/DeckList/DeckListPage'
import { InputPage } from './components/Input/InputPage'
import { FlashPage } from './components/Flash/FlashPage'

function App() {
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
