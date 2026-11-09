import { useOutletContext } from 'react-router-dom'
import SearchArticlesPage from './SearchArticlesPage'

export default function ResearchSearchPage() {
  const { researchId, researchName, sessionArticles, addToSession } = useOutletContext()
  return (
    <SearchArticlesPage
      research={{ id: researchId, name: researchName }}
      sessionArticles={sessionArticles}
      onSessionAdd={addToSession}
    />
  )
}
