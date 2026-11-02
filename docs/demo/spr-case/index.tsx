import { Bar, Stage, Text, Window, Row } from '../../kit'
import './card.css'

// A fictional private-case illustration, adapted from Stageshow's static-card.
export default function SprCase() {
  return <Stage width={400} height={300} compact={{ below: 400, width: 358, height: 300 }} className="sc-card">
    {() => <>
      <Window className="sc-window">
        <aside className="sc-sidebar">
          <div className="sc-brand">SPR</div>
          {['Case', 'Evidence', 'Decision'].map((name, i) => <div key={name} className="sc-nav" data-on={i === 0 || undefined}><Text className="sc-nav__label">{name}</Text></div>)}
        </aside>
        <div className="sc-main">
          <div className="sc-header"><Text className="sc-title">Case review</Text></div>
          <div className="sc-list">
            <Row pad={0} selected className="sc-row" title={<Text className="sc-name">Evidence received</Text>} />
            <Row pad={0} className="sc-row" title={<Text className="sc-rowname">Assessment recorded</Text>} />
            <Row pad={0} className="sc-row" title={<Text className="sc-rowname">Private case</Text>} />
            <Row pad={0} className="sc-row" title={<Bar w={78} tone={3} />} />
          </div>
        </div>
      </Window>
      <div className="sc-detail">
        <div className="sc-detail-head"><div className="sc-detail-who"><Text className="sc-detail-name">Case outcome</Text></div></div>
        <div className="sc-detail-row"><Text className="sc-detail-label">Review</Text><Text className="sc-detail-label">Recorded</Text></div>
        <div className="sc-detail-row total"><Text className="sc-detail-total">Decision recorded</Text></div>
        <Text className="sc-disclaimer">Illustration · Private case only</Text>
      </div>
    </>}
  </Stage>
}
