import * as _ from 'lodash';

interface Outcome {
  originalRolls?: string[];
  rolls: string[];
  total: number;
}

interface Throttles {
  faces: number;
  modifier: number;
  multiplier: number;
  repeat: number;
  times: number;
}
interface Options {
  command?: string;
  throttles: Throttles;
}

interface Parsed {
  times?: number; faces?: number;
  keep?: number | null; lowest?: boolean;
  highest?: boolean; multiplier?: number;
  modifier?: number; repeat?: number;
}
interface Data {
  command?: string;
  outcomes: number[];
  parsed?: Parsed;
  text: string[];
  verbose: string[];
}
class Dice {
  public static readonly defaults: Options = {
    command: 'd20',
    throttles: {
      faces: 100,
      modifier: 100,
      multiplier: 100,
      repeat: 100,
      times: 100,
    }
  };
  public options: Options;
  public data: Data;
  constructor(options: Options) {
    this.options = _.assign(Dice.defaults, options);
    this.data = {
      command: undefined,
      outcomes: [],
      parsed: undefined,
      text: [],
      verbose: []
    };
  }

  // execute command
  public execute(command?: string) {
    const data = this.data;

    if (!command || !command.trim().length) {
      command = this.options.command || 'd20'; // TODO: Option
    }

    const parsed = this.parse(command);

    data.parsed = parsed;
    data.command = command;

    // throttle values provided
    this.throttle();

    _.times(data.parsed.repeat, (n) => {
      const text = [];
      const verbose: string[] = [];
      const outcome: Outcome = {
        rolls: [],
        total: 0,
      };

      // make the rolls
      _.times(data.parsed.times, (n1: number) => {
        const rolled = this.roll(data.parsed.faces);
        outcome.rolls.push(rolled);
        verbose.push('Roll #' + (n1 + 1) + ': ' + rolled);
      });

      // do we need to keep a certain number of the rolls?
      if (parsed.keep) {
        outcome.originalRolls = outcome.rolls;
        outcome.rolls = _.sample(outcome.originalRolls, parsed.keep);
        verbose.push('Keeping ' + parsed.keep + ' of ' + parsed.times + ' rolls: ' + outcome.rolls.toString());
      }

      // do we need to keep the highest or lowest roll?
      if (parsed.highest) {
        const max = _.max(outcome.rolls);
        outcome.originalRolls = outcome.originalRolls || outcome.rolls;
        outcome.rolls = [max];
        verbose.push('Selecting the highest roll: ' + max);
      } else if (parsed.lowest) {
        const min = _.min(outcome.rolls);
        outcome.original_rolls = outcome.original_rolls || outcome.rolls;
        outcome.rolls = [min];
        verbose.push('Selecting the lowest roll: ' + min);
      }

      // determine the total of the rolls without the modifier
      outcome.total = _.reduce(outcome.rolls, function (sum, roll) {
        return sum + roll;
      });
      if (parsed.times > 1) {
        verbose.push('Adding up all the rolls: ' + outcome.rolls.join(' + ') + ' = ' + outcome.total);
      }
      text.push('[ ' + outcome.rolls.join(' + ') + ' ]');

      // apply the multiplier
      if (parsed.multiplier > 1) {
        text.push('x ' + parsed.multiplier);
        verbose.push('Applying the multiplier: ' + outcome.total + ' x ' + parsed.multiplier +
          ' = ' + (outcome.total * parsed.multiplier));
        outcome.total *= parsed.multiplier;
      }

      // add the modifier
      if (parsed.modifier > 0) {
        text.push('+ ' + parsed.modifier);
        verbose.push('Adding the modifier: ' + outcome.total + ' + ' + parsed.modifier +
          ' = ' + (outcome.total + parsed.modifier));
        outcome.total += parsed.modifier;
      }

      verbose.push('The total of outcome #' + (n + 1) + ' is ' + outcome.total);

      data.outcomes.push(outcome);

      if (text.length) {
        data.text.push(text);
      }
      data.verbose.push(verbose);

    });

    const total = _.chain(data.outcomes).pluck('total')
      .reduce((sum: number, total: number) => {
        return sum + total;
      }).value();

    data.verbose = _.flatten(data.verbose);
    data.verbose.push('The results of ' + data.command + ' is ' + total);
    if (data.text.length > 1) {
      data.text = _.map(data.text, (value) => {
        return '(' + value.join(' ') + ')';
      }).join(' + ');
      data.text += ' = ' + total;
    } if (data.text.length === 0) {
      data.text = total;
    } else {
      data.text = _.flatten(data.text).join(' ') + ' = ' + total;
    }
    data.text = 'The result of ' + data.command + ' is ' + data.text;

    return data;
  }

  // rolls the die and returns the outcome
  public roll(faces: number) {
    const min = 1;
    const max = faces;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // parses a command given in dice notation
  public parse(command: string): Parsed {

    const parsed: Parsed = {};

    //TODO: Test
    const matchFirstGroup = (regexp: RegExp,
      startGroup: number = 1, endGroup: number = 1) => {
      for (let i = startGroup; i <= endGroup; i++) {
        const match = command.match(regexp);
        const result = match && match[i] && parseInt(match[i], 10);
        if (result) return result;
      }
    }

    // determine number of dice to roll
    parsed.times = matchFirstGroup(/(\d+)d/i) || 1; //TODO: Option

    // determine the number of faces
    parsed.faces = matchFirstGroup(/d(\d+)/i) || 20; //TODO: Option

    // determine the number of dice to keep
    parsed.keep = matchFirstGroup(/\(k(\d+)\)/i) || null;

    // TODO: Keep is negative, positive, or zero
    // determine if should keep the lowest rolled dice
    parsed.lowest = /-L/.test(command);

    // determine if should keep the highest rolled dice
    parsed.highest = /-H/.test(command);

    // determine the multiplier
    parsed.multiplier = matchFirstGroup(/(?!d\d+)x(\d+)/) || 1;

    // determine the modifier
    parsed.modifier = matchFirstGroup(/(\+\d+\)?|-\d+)\)?/) || 0;

    // determine if we need to repeat at all
    parsed.repeat = matchFirstGroup(/^(\d+)x\(|\)x(\d+)$/, 1, 2) || 1;

    return parsed;
  }
  // turns a parsed command into a command string
  public format(parsed?: Parsed) {
    let command = '';

    if (!parsed) {
      return this.options.command || 'd20'; //TODO: Option
    }

    // add the number of dice to be rolled
    if (parsed.times) {
      command += parsed.times;
    }

    // add the number of faces
    command += (parsed.faces) ? 'd' + parsed.faces : 'd' + 20;

    // add dice to keep command
    if (parsed.keep) {
      command += '(k' + parsed.keep + ')';
    }

    // add keep lowest command
    if (parsed.lowest) {
      command += '-L';
    }

    // add the multipier
    if (parsed.multiplier && parsed.multiplier !== 1) {
      command += 'x' + parsed.multiplier;
    }

    // add the modifier
    if (parsed.modifier && parsed.modifier > 0) {
      command += '+' + parsed.modifier;
    } else if (parsed.modifier) {
      command += parsed.modifier;
    }

    // add the repeat and add command
    if (parsed.repeat) {
      command = parsed.repeat + '(' + command + ')';
    }

    return command || undefined;
  };
  // validates that any value provided is less than our throttle value
  public throttle(): void {
    const self = this;
    const parsed = self.data.parsed;
    const throttles = self.options.throttles;

    _.forOwn(parsed, (value: number, key: string) => {
      if (_.has(throttles, key) && value > throttles[key]) {
        throw new Error(key + ' (' + value + ') exceeds the limit of ' + throttles[key] + ' that has been imposed');
      }
    });
  }
}

module.exports = Dice;
