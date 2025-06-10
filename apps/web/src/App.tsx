import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import routes from './routes';
import './styles/App.css';

// 1. Невикористана змінна
const unusedVariable = 'test';

function App() {
  const router = createBrowserRouter(routes);

  return <RouterProvider router={router} />;
}

// 2. Відсутній тип для параметра
function testFunction(param) {
  return param;
}

// 3. console.log (зазвичай заборонено в продакшені)
console.log('test');

// 4. Відсутній return type
function getNumber() {
  return 42;
}

export default App;
