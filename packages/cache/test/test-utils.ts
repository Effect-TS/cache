import * as T from "@effect-ts/core/Effect"
import * as Structural from "@effect-ts/core/Structural"

export function hash(x: number) {
  return (y: number): T.UIO<number> =>
    T.succeedWith(() =>
      Structural.combineHash(Structural.hashNumber(x), Structural.hashNumber(y))
    )
}
