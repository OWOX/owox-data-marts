export function Video2LookerAsDestination() {
  return (
    <div className='relative aspect-[1544/1080] rounded-md'>
      <iframe
        src='https://customer-4geatlj66rtkaxtz.cloudflarestream.com/93985b60a2758efc77b762f9e291870e/iframe?muted=true&autoplay=true&loop=true&poster=https%3A%2F%2Fcustomer-4geatlj66rtkaxtz.cloudflarestream.com%2F93985b60a2758efc77b762f9e291870e%2Fthumbnails%2Fthumbnail.jpg%3Ftime%3D%26height%3D600'
        loading='lazy'
        className='absolute top-0 left-0 h-full w-full rounded-md border-none'
        allow='accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;'
        allowFullScreen
      />
    </div>
  );
}
