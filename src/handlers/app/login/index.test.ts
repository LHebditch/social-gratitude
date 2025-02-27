import { handler } from "."

const main = async () => {
    const h = await handler(null, null, null)
    console.log(h)
}

main()
