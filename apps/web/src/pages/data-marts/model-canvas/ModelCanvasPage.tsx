import { ModelCanvasView } from '../../../features/data-marts/model-canvas/components/ModelCanvasView';

export default function ModelCanvasPage() {
  return (
    <div className='dm-page' data-testid='modelCanvasPage'>
      <header className='dm-page-header'>
        <h1 className='dm-page-header-title'>Models</h1>
      </header>
      <div className='dm-page-content'>
        <ModelCanvasView />
      </div>
    </div>
  );
}
