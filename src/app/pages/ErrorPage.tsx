import { isRouteErrorResponse, useRouteError } from 'react-router';
import { ErrorPattern } from '@hirobius/design-system';

type RecoverySurfaceProps = {
  displayText: string;
  message: string;
};

function getErrorSurfaceCopy(error: unknown): RecoverySurfaceProps {
  if (isRouteErrorResponse(error)) {
    return {
      displayText: 'Oops',
      message: error.status === 404 ? 'Page not found' : 'Something went wrong',
    };
  }

  return {
    displayText: 'Oops',
    message: 'Something went wrong',
  };
}

function RecoverySurface({ displayText, message }: RecoverySurfaceProps) {
  return <ErrorPattern displayText={displayText} message={message} />;
}

export default function ErrorPage() {
  const error = useRouteError();
  const copy = getErrorSurfaceCopy(error);

  return <RecoverySurface {...copy} />;
}
