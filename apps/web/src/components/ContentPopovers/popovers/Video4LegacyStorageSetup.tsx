export function Video4LegacyStorageSetup() {
  return (
    <div className='relative aspect-[16/9] rounded-md'>
      <iframe
        src='https://customer-4geatlj66rtkaxtz.cloudflarestream.com/c2c31d3821d2e0c910fb1d9260323cb4/iframe?muted=true&autoplay=true&poster=https%3A%2F%2Fcustomer-4geatlj66rtkaxtz.cloudflarestream.com%2Fc2c31d3821d2e0c910fb1d9260323cb4%2Fthumbnails%2Fthumbnail.jpg%3Ftime%3D%26height%3D600'
        loading='lazy'
        className='absolute top-0 left-0 h-full w-full rounded-md border-none'
        allow='accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;'
        allowFullScreen
      />
    </div>
  );
}
